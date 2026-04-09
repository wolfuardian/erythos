import { render } from 'solid-js/web';
import App from './app/App';
import './styles/theme.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

render(() => <App />, root);
