import './styles.css';
import { initDebug } from './platform/debug';
import { App } from './ui/app';

// A fonte ativa vem do localStorage (telas de Opcoes > Fontes). Em dev, se nao
// houver nenhuma, a App cai para VITE_XTREAM_BASE (.env.local) automaticamente.
initDebug();
const root = document.getElementById('app');
if (root) new App(root).start();
