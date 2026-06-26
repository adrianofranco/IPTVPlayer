// Mapeia teclas do controle remoto (Tizen) e do teclado (dev) para acoes logicas.

export type RemoteAction =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'enter'
  | 'back'
  | 'play'
  | 'pause'
  | 'stop'
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue';

const KEY_MAP: Record<number, RemoteAction> = {
  37: 'left',
  38: 'up',
  39: 'right',
  40: 'down',
  13: 'enter',
  10009: 'back', // Tizen Return
  8: 'back', // Backspace (dev)
  27: 'back', // Esc (dev)
  415: 'play',
  19: 'pause',
  413: 'stop',
  403: 'red',
  404: 'green',
  405: 'yellow',
  406: 'blue',
};

export function actionFromKey(e: KeyboardEvent): RemoteAction | undefined {
  return KEY_MAP[e.keyCode];
}

/** Em Tizen, teclas coloridas/midia so chegam se registradas. No-op fora do Tizen. */
export function registerTizenKeys(): void {
  const dev = (window as unknown as {
    tizen?: { tvinputdevice?: { registerKey(name: string): void } };
  }).tizen?.tvinputdevice;
  if (!dev) return;
  const keys = [
    'ColorF0Red',
    'ColorF1Green',
    'ColorF2Yellow',
    'ColorF3Blue',
    'MediaPlay',
    'MediaPause',
    'MediaStop',
    'MediaPlayPause',
  ];
  for (const k of keys) {
    try {
      dev.registerKey(k);
    } catch {
      /* tecla nao suportada nesse modelo — ignora */
    }
  }
}
