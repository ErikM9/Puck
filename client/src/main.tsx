import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

/* StrictMode double-invokes effects in development, which is what surfaces missing cleanup */
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)