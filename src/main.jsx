import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import App from './routes/App.jsx';
import Login from './routes/Login.jsx';
import Projects from './routes/Projects.jsx';
import Project from './routes/Project.jsx';
import Community from './routes/Community.jsx';
import SharePage from './routes/SharePage.jsx';
import MyShares from './routes/MyShares.jsx';
import PairPage from './routes/PairPage.jsx';
import AuthCallback from './routes/AuthCallback.jsx';
import ResetPassword from './routes/ResetPassword.jsx';
import NotFound from './routes/NotFound.jsx';
import Privacy from './routes/Privacy.jsx';
import RouterRoot from './components/RouterRoot.jsx';
import { captureAuthCallbackParameters } from './lib/authRouting.js';

import './index.css';

captureAuthCallbackParameters();

const router = createBrowserRouter([
  {
    element: <RouterRoot />,
    children: [
      { path: '/', element: <App /> },
      { path: '/login', element: <Login /> },
      { path: '/auth/callback', element: <AuthCallback /> },
      { path: '/projects', element: <Projects /> },
      { path: '/projects/:id', element: <Project /> },
      { path: '/community', element: <Community /> },
      { path: '/s/:slug', element: <SharePage /> },
      { path: '/p/:id', element: <PairPage /> },
      { path: '/my-shares', element: <MyShares /> },
      { path: '/reset-password', element: <ResetPassword /> },
      { path: '/privacy', element: <Privacy /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById('root')).render(
  <RouterProvider router={router} />
);
