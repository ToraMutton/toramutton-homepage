// トップページのターミナル系ウィジェット(hero / Mini Terminal / Today's Music)
// が共通で使う「1文字ずつ打つ」演出。
//
// タイマーは Timers にまとめて持たせておき、再抽選やページ遷移のときに
// clear() で一括キャンセルする(打ち途中の古い文字列が後から混ざらないように)。
// prefers-reduced-motion のときは打たずに即表示する。

export interface Timers {
  add(fn: () => void, ms: number): void;
  clear(): void;
}

export function createTimers(): Timers {
  let ids: ReturnType<typeof setTimeout>[] = [];
  return {
    add(fn, ms) {
      ids.push(setTimeout(fn, ms));
    },
    clear() {
      ids.forEach(clearTimeout);
      ids = [];
    },
  };
}

export const reduceMotion = (): boolean =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Timers 経由の setTimeout を Promise にしたもの。clear() されたら resolve しない */
export const wait = (timers: Timers, ms: number): Promise<void> =>
  new Promise((resolve) => timers.add(resolve, ms));

/** 1文字ずつ textContent を伸ばす。打ち終わると resolve */
export function typeText(
  el: HTMLElement,
  text: string,
  timers: Timers,
  msPerChar = 38,
): Promise<void> {
  el.textContent = "";
  if (reduceMotion()) {
    el.textContent = text;
    return Promise.resolve();
  }
  const chars = [...text];
  return new Promise((resolve) => {
    let i = 0;
    const tick = () => {
      if (i >= chars.length) return resolve();
      el.textContent += chars[i++];
      timers.add(tick, msPerChar);
    };
    tick();
  });
}

const GLITCH_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*<>/\\|";
const randChar = () =>
  GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];

/** 文字が確定する前に数回ランダム文字が走る、グリッチ付きのタイプライター */
export function glitchType(
  el: HTMLElement,
  text: string,
  timers: Timers,
  { msPerChar = 45, msPerGlitch = 38, glitches = 3 } = {},
): Promise<void> {
  el.textContent = "";
  if (reduceMotion()) {
    el.textContent = text;
    return Promise.resolve();
  }
  const chars = [...text];
  return new Promise((resolve) => {
    let confirmed = 0;
    const next = () => {
      if (confirmed >= chars.length) return resolve();
      const target = chars[confirmed];
      const base = chars.slice(0, confirmed).join("");
      // 記号や空白はグリッチさせない
      let left = /[\p{L}\p{N}]/u.test(target) ? glitches : 0;
      const tick = () => {
        if (left <= 0) {
          el.textContent = base + target;
          confirmed++;
          timers.add(next, msPerChar);
        } else {
          el.textContent = base + randChar();
          left--;
          timers.add(tick, msPerGlitch);
        }
      };
      tick();
    };
    next();
  });
}

/**
 * カードヘッダーの3つのドット(赤/黄/緑)に演出を付ける。
 * Mini Terminal と Today's Music で同じ挙動にするための共通化。
 *   赤: `exit 0` → 「Connection closed. / Rebooting...」→ 再抽選
 *   黄: カードが縮んで消え、戻ってきたら再抽選
 *   緑: 「re-rolling...」を出してから再抽選
 * body の中に足す行は appendLine で作る(カードごとにクラスが違うため)。
 */
export function bindDots(opts: {
  card: HTMLElement;
  body: HTMLElement;
  dots: Iterable<HTMLElement>;
  appendLine: (text: string, kind: "cmd" | "comment") => HTMLElement;
  reroll: () => void;
}) {
  const { card, body, dots, appendLine, reroll } = opts;
  const BUSY = "is-busy";
  const fade = (visible: boolean) => {
    body.style.transition = "opacity 0.3s ease";
    body.style.opacity = visible ? "1" : "0";
  };
  const done = () => {
    body.style.cssText = "";
    card.classList.remove(BUSY);
  };

  for (const dot of dots) {
    dot.addEventListener("click", () => {
      if (card.classList.contains(BUSY)) return;
      card.classList.add(BUSY);
      const kind = dot.dataset.dot;

      if (kind === "red") {
        const exitLine = appendLine("exit 0", "cmd");
        setTimeout(() => {
          fade(false);
          setTimeout(() => {
            // 元の中身は消さずに隠しておき、再起動メッセージを重ねる
            // (Today's Music は要素を id で掴んでいるので作り直せない)
            exitLine.remove();
            const originals = Array.from(body.children) as HTMLElement[];
            originals.forEach((el) => (el.hidden = true));
            const msgs = [
              appendLine("Connection closed.", "comment"),
              appendLine("Rebooting...", "comment"),
            ];
            fade(true);
            setTimeout(() => {
              fade(false);
              setTimeout(() => {
                msgs.forEach((m) => m.remove());
                originals.forEach((el) => (el.hidden = false));
                done();
                reroll();
              }, 320);
            }, 1000);
          }, 350);
        }, 500);
      } else if (kind === "yellow") {
        card.classList.add("is-squishing");
        setTimeout(() => {
          reroll();
          card.classList.remove("is-squishing");
          setTimeout(() => card.classList.remove(BUSY), 350);
        }, 500);
      } else {
        const msg = appendLine("re-rolling...", "comment");
        setTimeout(() => {
          msg.style.cssText = "opacity:0; transition:opacity 0.3s ease";
          setTimeout(() => {
            done();
            reroll();
          }, 320);
        }, 800);
      }
    });
  }
}
