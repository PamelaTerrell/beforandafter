import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import App from './routes/App.jsx';
import Login from './routes/Login.jsx';
import Projects from './routes/Projects.jsx';
import Project from './routes/Project.jsx';
import Community from './routes/Community.jsx';   // ⬅️ add this
import SharePage from './routes/SharePage.jsx';   // ⬅️ add this

import './index.css';

const router = createBrowserRouter([
  { path: '/', element: <App /> },
  { path: '/login', element: <Login /> },
  { path: '/projects', element: <Projects /> },
  { path: '/projects/:id', element: <Project /> },
  { path: '/community', element: <Community /> }, // ⬅️ new
  { path: '/s/:slug', element: <SharePage /> },   // ⬅️ new
  // Optional catch-all: send unknown routes home (or make a NotFound page)
  { path: '*', element: <App /> },
]);

ReactDOM.createRoot(document.getElementById('root')).render(
  <RouterProvider router={router} />
);
