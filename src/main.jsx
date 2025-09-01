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
import PairPage from './routes/PairPage.jsx'; // <-- make sure this path matches the file location

import './index.css';

const router = createBrowserRouter([
  { path: '/', element: <App /> },
  { path: '/login', element: <Login /> },
  { path: '/projects', element: <Projects /> },
  { path: '/projects/:id', element: <Project /> },
  { path: '/community', element: <Community /> },
  { path: '/s/:slug', element: <SharePage /> },
  { path: '/p/:id', element: <PairPage /> },   // <-- fixed syntax + trailing comma
  { path: '/my-shares', element: <MyShares /> },
  { path: '*', element: <App /> },
]);

ReactDOM.createRoot(document.getElementById('root')).render(
  <RouterProvider router={router} />
);
