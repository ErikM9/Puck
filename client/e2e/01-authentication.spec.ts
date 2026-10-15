import { test, expect, uniqueEmail, registerAccount, PASSWORD } from './support/fixtures';

/* The only file that drives the account forms, as every other spec seeds its account through the API */
test.describe('Authentication', () => {

  test.describe('registration and sign-in', () => {

    test('a new account can be created and lands on the deck list', async ({ page, auth }) => {
      await auth.goto();

      await auth.registerAndSignIn(uniqueEmail());

      await expect(page).toHaveURL(/\/home$/);
      await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
    });

    test('an existing account can sign back in after logging out', async ({ page, request, auth }) => {
      const email = await registerAccount(request);
      await auth.goto();
      await auth.login(email);
      /* Waits for the deck list, so logging out never races the session's own request for it */
      await expect(page.getByText('You have no decks yet.')).toBeVisible();

      await page.getByRole('button', { name: 'Log out' }).click();
      await expect(page).toHaveURL(/\/$/);
      await auth.login(email);

      await expect(page).toHaveURL(/\/home$/);
      await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
    });
  });

  test.describe('rejected credentials', () => {

    test('a blank login form asks for its fields instead of calling them wrong', async ({ page, auth }) => {
      /* Counted rather than awaited, as the point is that the form sends nothing */
      let logins = 0;
      await page.route('**/auth/login', route => { logins += 1; return route.continue(); });
      await auth.goto();

      await page.getByRole('button', { name: 'Login', exact: true }).click();
      await expect(page.getByRole('alert')).toHaveText('Please enter your email and password.');

      await page.getByLabel('Email:').fill(uniqueEmail());
      await page.getByRole('button', { name: 'Login', exact: true }).click();
      await expect(page.getByRole('alert')).toHaveText('Please enter your password.');
      expect(logins).toBe(0);
    });

    test('signing in with an unknown address is refused and stays on the form', async ({ page, auth }) => {
      await auth.goto();

      await auth.login(uniqueEmail());

      await expect(page.getByRole('alert')).toHaveText('Invalid email or password');
      await expect(page).toHaveURL(/\/$/);
    });

    test('signing in with the wrong password is refused with the same message', async ({ page, request, auth }) => {
      const email = await registerAccount(request);
      await auth.goto();

      await auth.login(email, `${PASSWORD}-wrong`);

      await expect(page.getByRole('alert')).toHaveText('Invalid email or password');
      await expect(page).toHaveURL(/\/$/);
    });

    test('registering an address twice is refused', async ({ page, request, auth }) => {
      const email = await registerAccount(request);
      await auth.goto();

      await auth.register(email);

      await expect(page.getByRole('alert')).toHaveText('This email is already in use');
    });
  });

  test.describe('password recovery', () => {

    test('a registered address and an unknown one reach the same code step', async ({ page, request, auth }) => {
      const registered = await registerAccount(request);

      for (const email of [registered, uniqueEmail()]) {
        await auth.goto();
        await auth.enterRecovery();
        await auth.requestCode(email);

        await expect(page.getByLabel('Recovery Code:')).toBeVisible();
        await expect(page.getByText(/^If that email address is registered, a 6-/)).toBeVisible();
      }
    });

    test('Back to Login leaves recovery for the login form', async ({ page, auth }) => {
      await auth.goto();
      await auth.enterRecovery();

      await page.getByRole('button', { name: 'Back to Login' }).click();

      await expect(page.getByRole('tab', { name: 'Login' })).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeVisible();
    });
  });

  test('a signed-out visitor cannot reach the deck list directly', async ({ page }) => {
    await page.goto('/home');

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeVisible();
  });
});