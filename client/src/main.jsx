import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './styles.css';
import { AuthProvider } from './auth/AuthProvider.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Owner from './pages/Owner.jsx';
import Event from './pages/Event.jsx';
import Admin from './pages/Admin.jsx';
import NotFound from './pages/NotFound.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/owner" element={<Owner />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/e/:id" element={<Event />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);
