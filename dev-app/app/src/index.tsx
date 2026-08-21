import '@backstage/cli/asset-types';
// Required, and its absence is silent: @backstage/ui ships unstyled without
// it, so the app renders as serif plain text with the layout intact. Both the
// catalog's own chrome and Colophon's renderer are built on it.
import '@backstage/ui/css/styles.css';
import ReactDOM from 'react-dom/client';
import App from './App';

const container = document.getElementById('root');
if (!container) {
  throw new Error('index.html is missing the #root element');
}

ReactDOM.createRoot(container).render(App);
