import { render } from 'solid-js/web';
import App from './app/App';
import './styles/theme.css';

// 一次性 migration：清掉 toy mode 時代的 autosave key
// （Epic #613 後 AutoSave 改寫到 project file，這個 key 已無用）
if (localStorage.getItem('erythos-autosave-v3') !== null) {
  localStorage.removeItem('erythos-autosave-v3');
  console.info('[migration] removed legacy autosave key erythos-autosave-v3');
}

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

render(() => <App />, root);
