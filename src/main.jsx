import { createRoot } from 'react-dom/client';
import { ConvexProvider } from 'convex/react';
import App from './App.jsx';
import { prodConvex } from './lib/prodConvexClient';
import './index.css';

const convexUrl = import.meta.env.VITE_CONVEX_URL;

if (!convexUrl) {
  createRoot(document.getElementById('root')).render(
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'system-ui', color: '#dc2626', padding: '2rem', textAlign: 'center' }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Configuration Error</h1>
        <p>VITE_CONVEX_URL environment variable is not set. The app cannot connect to the backend.</p>
      </div>
    </div>
  );
} else {
  // No StrictMode - avoids double-mount issues with persistent connections
  createRoot(document.getElementById('root')).render(
    <ConvexProvider client={prodConvex}>
      <App />
    </ConvexProvider>
  );
}
