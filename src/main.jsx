import { createRoot } from 'react-dom/client';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import App from './App.jsx';
import './index.css';

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL || '');

// No StrictMode - avoids double-mount issues with persistent connections
createRoot(document.getElementById('root')).render(
  <ConvexProvider client={convex}>
    <App />
  </ConvexProvider>
);
