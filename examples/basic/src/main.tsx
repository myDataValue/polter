import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

// biome-ignore lint/style/noNonNullAssertion: grandfathered at Biome adoption — fix and remove over time
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
