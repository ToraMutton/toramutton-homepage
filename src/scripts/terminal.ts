// /about のミニターミナルの動き。見た目は components/about/AboutTerminal.astro、
// 打てるコマンドの定義は src/data/terminal.ts。
//
// できること
//   - 入力欄にコマンドを打って Enter で実行(組み込み 4 つ + おまけ約 40 個)
//   - ↑ ↓ で履歴、Tab で補完、Ctrl+L で clear、Ctrl+C で入力を捨てる
//   - 最初から表示されている fastfetch の中身は、SSR した HTML をそのまま複製して再表示する
//   - UUID をクリックするとコピー(「copied」と一瞬だけ表示)
//   - 年齢は、ビルド時の値を JST の今日で数え直す(タブを開きっぱなしでも、リビルド前でも正しい)
//
// すりガラスの安全弁
//   backdrop-filter は、背後の WebGL(ローレンツアトラクタ)が毎フレーム動くたびにぼかしをやり直すので、
//   非力な端末では重くなる。起動 1.5 秒後から 60 フレームの間隔を測り、中央値が 30ms を超えたら
//   (= 約 33fps を下回る)自動で半透明だけの見た目に切り替える。結果は sessionStorage に覚える。
//   確かめたいときは URL に ?glass=on / ?glass=off を付けると、測らずに強制できる。

import { builtins, HELP_HINT, notFound, SUDO_DENIED, terminalCommands, type BuiltinAction } from "../data/terminal";
import { ageOn } from "../utils/age";
import { todayJST } from "../utils/countdown";

/** ログに残す行(ブロック)の最大数。超えたら古いものから消す */
const MAX_ENTRIES = 80;
const GLASS_KEY = "term-glass";

const norm = (s: string) => s.trim().replace(/\s+/g, " ");
const SCRAMBLE = "!<>-_\\/[]{}=+*^?#";

/** 文字列の先頭からの共通部分 */
function commonPrefix(list: string[]): string {
  let p = list[0] ?? "";
  for (const s of list) while (!s.toLowerCase().startsWith(p.toLowerCase())) p = p.slice(0, -1);
  return p;
}

export function mountTerminal(root: HTMLElement): () => void {
  const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const body = q("[data-term-body]");
  const log = q("[data-term-log]");
  const form = q<HTMLFormElement>("[data-term-form]");
  const input = q<HTMLInputElement>("input");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // 最初の fastfetch の HTML を、再表示用に控えておく
  const ffTemplate = log.querySelector<HTMLElement>("[data-ff]")!.cloneNode(true) as HTMLElement;

  const timers = new Set<number>();
  let rafId = 0;
  let destroyed = false;

  // ---- 出力 ----
  const scrollToEnd = () => {
    body.scrollTop = body.scrollHeight;
  };
  const append = <T extends HTMLElement>(el: T): T => {
    log.append(el);
    while (log.childElementCount > MAX_ENTRIES) log.firstElementChild?.remove();
    scrollToEnd();
    return el;
  };
  const line = (text: string, cls = "") => {
    const p = document.createElement("p");
    p.className = `term-line ${cls}`.trim();
    p.textContent = text;
    return append(p);
  };
  /** 「> コマンド」の行(打ったコマンドの記録) */
  const echo = (cmd: string) => {
    const p = document.createElement("p");
    p.className = "term-line term-cmd";
    const prompt = document.createElement("span");
    prompt.className = "term-prompt";
    prompt.textContent = ">";
    p.append(prompt, ` ${cmd}`);
    return append(p);
  };

  // ---- 年齢 ----
  const refreshAge = (scope: ParentNode = root) => {
    const today = todayJST();
    scope.querySelectorAll<HTMLElement>("[data-age]").forEach((el) => {
      const birthday = el.dataset.birthday;
      if (birthday) el.textContent = String(ageOn(birthday, today));
    });
  };
  refreshAge();

  // ---- コマンドの実行 ----
  const extras = new Map(terminalCommands.map((t) => [t.cmd.toLowerCase(), t]));
  const findBuiltin = (cmd: string) => {
    const c = cmd.toLowerCase();
    return builtins.find((b) => b.name === c || b.aliases?.includes(c));
  };

  /** 曲名を、ランダムな記号から左へ順に確定させていく(グリッチ風) */
  function scramble(el: HTMLElement, text: string) {
    if (reduceMotion) {
      el.textContent = text;
      return;
    }
    let frame = 0;
    const total = 18;
    const id = window.setInterval(() => {
      frame++;
      const settled = Math.floor((frame / total) * text.length);
      el.textContent = [...text]
        .map((ch, i) => (i < settled || ch === " " ? ch : SCRAMBLE[Math.floor(Math.random() * SCRAMBLE.length)]))
        .join("");
      if (frame >= total) {
        clearInterval(id);
        timers.delete(id);
        el.textContent = text;
        scrollToEnd();
      }
    }, 34);
    timers.add(id);
  }

  async function playMusic() {
    // 290 曲ぶんのデータは、使うときまで読み込まない
    const { songs } = await import("../data/songs");
    if (destroyed) return;
    const song = songs[Math.floor(Math.random() * songs.length)];
    const box = document.createElement("div");
    box.className = "term-music";
    const title = document.createElement("p");
    title.className = "term-line term-music-title";
    const meta = document.createElement("p");
    meta.className = "term-line term-music-meta";
    meta.textContent = `${song.artist} · ${song.year}`;
    box.append(title, meta);
    append(box);
    scramble(title, `♪ ${song.title}`);
  }

  function runAction(action: BuiltinAction) {
    switch (action) {
      case "help": {
        const box = document.createElement("div");
        box.className = "term-help";
        for (const b of builtins) {
          const name = document.createElement("span");
          name.className = "term-help-name";
          name.textContent = b.name;
          const desc = document.createElement("span");
          desc.textContent = b.desc;
          box.append(name, desc);
        }
        append(box);
        line(HELP_HINT, "dim");
        break;
      }
      case "fastfetch": {
        const ff = ffTemplate.cloneNode(true) as HTMLElement;
        refreshAge(ff);
        append(ff);
        break;
      }
      case "music":
        void playMusic();
        break;
      case "clear":
        log.replaceChildren();
        break;
    }
  }

  const history: string[] = [];
  let hPos = 0;
  let draft = "";

  function run(raw: string) {
    const cmd = norm(raw);
    if (!cmd) {
      echo("");
      return;
    }
    if (history[history.length - 1] !== cmd) history.push(cmd);
    hPos = history.length;

    const builtin = findBuiltin(cmd);
    // clear は記録も残さず、画面ごときれいにする(本物のターミナルと同じ)
    if (builtin?.action === "clear") {
      runAction("clear");
      return;
    }
    echo(cmd);
    if (builtin) return runAction(builtin.action);

    const extra = extras.get(cmd.toLowerCase());
    if (extra) {
      if (extra.href) {
        const p = document.createElement("p");
        p.className = "term-line";
        const a = document.createElement("a");
        a.href = extra.href;
        a.textContent = extra.out;
        // /retro は通常ページと見た目が全く違うので、ClientRouter を使わず普通に読み込む
        a.setAttribute("data-astro-reload", "");
        p.append(a);
        append(p);
      } else {
        line(extra.out);
      }
      return;
    }
    if (cmd.toLowerCase().startsWith("sudo ")) return void line(SUDO_DENIED, "err");
    line(notFound(cmd.split(" ")[0]), "err");
  }

  // ---- 補完 ----
  function complete() {
    const value = input.value.trimStart();
    const lower = value.toLowerCase();
    const names = [...builtins.map((b) => b.name), ...terminalCommands.map((t) => t.cmd)];
    const hits = [...new Set(names.filter((n) => n.toLowerCase().startsWith(lower)))];
    if (hits.length === 0) return;
    const common = commonPrefix(hits);
    if (hits.length === 1) {
      input.value = hits[0];
    } else if (common.length > value.length) {
      input.value = common;
    } else {
      // これ以上は絞れないので、候補を見せる
      echo(value);
      line(hits.slice(0, 12).join("   ") + (hits.length > 12 ? "   …" : ""), "dim");
    }
  }

  // ---- 入力 ----
  const toEnd = () => requestAnimationFrame(() => input.setSelectionRange(input.value.length, input.value.length));

  const onKeydown = (e: KeyboardEvent) => {
    if (e.isComposing) return; // 日本語入力の変換中は触らない
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (hPos === history.length) draft = input.value;
      if (hPos > 0) input.value = history[--hPos];
      toEnd();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (hPos < history.length) hPos++;
      input.value = hPos === history.length ? draft : history[hPos];
      toEnd();
    } else if (e.key === "Tab" && input.value.trim() !== "") {
      // 何も打っていないときの Tab は、本来のフォーカス移動に譲る(キーボードで抜け出せなくなるため)
      e.preventDefault();
      complete();
    } else if (e.ctrlKey && e.key.toLowerCase() === "l") {
      e.preventDefault();
      runAction("clear");
    } else if (e.ctrlKey && e.key.toLowerCase() === "c") {
      if (input.selectionStart !== input.selectionEnd) return; // 選択中は本来のコピー
      e.preventDefault();
      echo(`${input.value}^C`);
      input.value = "";
    }
  };
  const onSubmit = (e: SubmitEvent) => {
    e.preventDefault();
    const value = input.value;
    input.value = "";
    draft = "";
    run(value);
  };
  input.addEventListener("keydown", onKeydown);
  form.addEventListener("submit", onSubmit);

  // ---- クリック: 余白を押したら入力欄にフォーカス / UUID はコピー ----
  const onClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const copy = target.closest<HTMLElement>("[data-copy]");
    if (copy) {
      const value = copy.dataset.copy ?? "";
      navigator.clipboard
        ?.writeText(value)
        .then(() => {
          copy.classList.add("is-copied");
          const id = window.setTimeout(() => {
            copy.classList.remove("is-copied");
            timers.delete(id);
          }, 1400);
          timers.add(id);
        })
        .catch(() => {
          /* clipboard が使えない環境では何もしない */
        });
      return;
    }
    if (target.closest("a, input")) return;
    if (window.getSelection()?.toString()) return; // 文字を選択しているときは邪魔しない
    input.focus({ preventScroll: true });
  };
  root.addEventListener("click", onClick);

  // ---- すりガラスの安全弁 ----
  function probeGlass() {
    const force = new URLSearchParams(location.search).get("glass");
    if (force === "on" || force === "off") {
      root.dataset.glass = force;
      return;
    }
    if (sessionStorage.getItem(GLASS_KEY) === "off") {
      root.dataset.glass = "off";
      return;
    }
    const deltas: number[] = [];
    let prev = 0;
    const sample = (now: number) => {
      if (destroyed) return;
      // タブが裏にあるときの間隔は当てにならないので、測り直す
      if (document.hidden) {
        deltas.length = 0;
        prev = 0;
      } else if (prev) {
        deltas.push(now - prev);
      }
      prev = document.hidden ? 0 : now;
      if (deltas.length < 60) {
        rafId = requestAnimationFrame(sample);
        return;
      }
      const median = [...deltas].sort((a, b) => a - b)[deltas.length >> 1];
      if (median > 30) {
        root.dataset.glass = "off";
        sessionStorage.setItem(GLASS_KEY, "off");
      }
    };
    const id = window.setTimeout(() => {
      timers.delete(id);
      rafId = requestAnimationFrame(sample);
    }, 1500);
    timers.add(id);
  }
  probeGlass();

  return () => {
    destroyed = true;
    timers.forEach((id) => {
      clearTimeout(id);
      clearInterval(id);
    });
    cancelAnimationFrame(rafId);
    input.removeEventListener("keydown", onKeydown);
    form.removeEventListener("submit", onSubmit);
    root.removeEventListener("click", onClick);
  };
}
