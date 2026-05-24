import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import Admin from './Admin.jsx';
import './index.css';

// Simple routing basé sur le path
const isAdminPage = window.location.pathname.startsWith('/admin');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isAdminPage ? <Admin /> : <App />}
  </React.StrictMode>
);
