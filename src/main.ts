import { createApp } from './core/app';

const root = document.getElementById('app');
if (!root) throw new Error('#app root element missing');
createApp(root);
