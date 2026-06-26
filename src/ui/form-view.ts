import type { RemoteAction } from '../platform/keys';
import type { Screen } from './screen';

export interface FormViewOptions {
  title: string;
  label: string;
  placeholder?: string;
  initial?: string;
  onSubmit: (value: string) => void;
  onBack: () => void;
}

/**
 * Tela de formulario com um campo de texto. No Tizen, focar o input abre o
 * teclado virtual do sistema. O input trata seus proprios eventos (Enter=salvar,
 * Voltar=cancelar); por isso o keydown global ignora alvos editaveis (ver App).
 */
export class FormView implements Screen {
  readonly el: HTMLElement;
  private readonly input: HTMLInputElement;

  constructor(private readonly opts: FormViewOptions) {
    this.el = document.createElement('div');
    this.el.className = 'screen form';

    const header = document.createElement('div');
    header.className = 'screen-header';
    header.textContent = opts.title;

    const body = document.createElement('div');
    body.className = 'form-body';

    const label = document.createElement('label');
    label.className = 'form-label';
    label.textContent = opts.label;

    this.input = document.createElement('input');
    this.input.className = 'form-input';
    this.input.type = 'text';
    this.input.value = opts.initial ?? '';
    if (opts.placeholder) this.input.placeholder = opts.placeholder;
    this.input.spellcheck = false;
    this.input.setAttribute('autocapitalize', 'off');
    this.input.setAttribute('autocomplete', 'off');
    this.input.addEventListener('keydown', (e) => {
      if (e.keyCode === 13) {
        e.preventDefault();
        this.submit();
      } else if (e.keyCode === 27 || e.keyCode === 10009) {
        e.preventDefault();
        this.opts.onBack();
      }
    });

    const hint = document.createElement('div');
    hint.className = 'form-hint';
    hint.textContent = 'Cole a URL e pressione OK/Enter para salvar · Voltar para cancelar';

    const actions = document.createElement('div');
    actions.className = 'form-actions';
    const save = document.createElement('button');
    save.className = 'form-btn';
    save.textContent = 'Salvar';
    save.addEventListener('click', () => this.submit());
    actions.appendChild(save);

    body.appendChild(label);
    body.appendChild(this.input);
    body.appendChild(hint);
    body.appendChild(actions);

    this.el.appendChild(header);
    this.el.appendChild(body);
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.el);
    setTimeout(() => this.input.focus(), 60);
  }

  setVisible(visible: boolean): void {
    this.el.style.display = visible ? '' : 'none';
  }

  destroy(): void {
    this.el.remove();
  }

  handleAction(action: RemoteAction): void {
    // chamado so quando o input nao esta focado (ele trata os proprios eventos)
    if (action === 'back') this.opts.onBack();
    else if (action === 'enter') this.submit();
  }

  private submit(): void {
    const value = this.input.value.trim();
    if (value) this.opts.onSubmit(value);
  }
}
