import type { RemoteAction } from '../platform/keys';

/** Uma tela na pilha de navegacao. O App roteia as acoes do controle para a tela do topo. */
export interface Screen {
  readonly el: HTMLElement;
  mount(parent: HTMLElement): void;
  setVisible(visible: boolean): void;
  destroy(): void;
  handleAction(action: RemoteAction): void;
}
