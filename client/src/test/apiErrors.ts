import { AxiosError, AxiosHeaders, InternalAxiosRequestConfig } from 'axios';

const requestConfig = (): InternalAxiosRequestConfig => ({ headers: new AxiosHeaders() });

/* The AxiosError a request rejects with when the API answers with an error status */
export const apiRefusal = (status: number, data: unknown, config = requestConfig()) =>
  new AxiosError(
    `Request failed with status code ${status}`,
    status < 500 ? AxiosError.ERR_BAD_REQUEST : AxiosError.ERR_BAD_RESPONSE,
    config,
    {},
    { status, statusText: '', headers: {}, config, data },
  );

/* The AxiosError a request rejects with when no answer arrives at all, which carries no response */
export const networkFailure = (config = requestConfig()) =>
  new AxiosError('Network Error', AxiosError.ERR_NETWORK, config, {});