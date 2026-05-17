import { createRoot } from 'react-dom/client';
import { App } from './App';

document.body.classList.add('tab-iul');

const root = document.getElementById('root');

if (!root) {
  throw new Error('React root element was not found.');
}

createRoot(root).render(<App />);
