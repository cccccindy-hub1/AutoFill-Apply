import React from 'react';
import ReactDOM from 'react-dom/client';
import '../styles/global.css';
import Sidebar from './Sidebar';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Sidebar />
  </React.StrictMode>
);
