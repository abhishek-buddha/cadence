import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// No StrictMode — avoids double-mount issues with persistent WebSocket
// connections (live call audio/transcript, /ws/updates), same reasoning as
// the pre-rewrite app.
createRoot(document.getElementById('root')).render(<App />);
