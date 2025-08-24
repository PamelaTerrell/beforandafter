import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import App from './routes/App.jsx';
import Login from './routes/Login.jsx';
import Projects from './routes/Projects.jsx';
import Project from './routes/Project.jsx';
import './index.css';

const router = createBrowserRouter([
  { path: '/', element: <App /> },
  { path: '/login', element: <Login /> },
  { path: '/projects', element: <Projects /> },
  { path: '/projects/:id', element: <Project /> },
]);

ReactDOM.createRoot(document.getElementById('root')).render(<RouterProvider router={router} />);

