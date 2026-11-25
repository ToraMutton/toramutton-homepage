// /links の Random Jump。演出は2段階。
//   1. 経路探索     … 光が行から行へホップする。ホップの間隔はだんだん伸びる
//   2. ハンドシェイク … 当選した行の回線を、粒が 行く → 返る → 行く(TCP の SYN → SYN-ACK → ACK)
// そのあと相手のサイトを別タブで開く。
//
// クリックから開くまでは約 1.2 秒。長く待たせると、ブラウザがポップアップとみなして止めることがある。
// 止められた場合は当選した行にフォーカスを移して、Enter で開けるようにする。

/** 各ホップで光っている時間(ms)。合計 670ms */
const HOP_DELAYS = [70, 80, 95, 115, 140, 170];
/** ハンドシェイクで粒が回線を渡りきる時間(ms)。3回で 510ms */
const PASS_MS = 170;

const LEFT = "0%";
const RIGHT = "calc(100% - 5px)";
const HANDSHAKE = [
  { label: "SYN →", from: LEFT, to: RIGHT },
  { label: "← SYN-ACK", from: RIGHT, to: LEFT },
  { label: "ACK →", from: LEFT, to: RIGHT },
];

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const pick = <T>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

/** 固定ヘッダー(72px)に隠れず、全体が画面に入っているか */
function isInView(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  return rect.top >= 72 && rect.bottom <= window.innerHeight;
}

export function initPeerJump(): void {
  const root = document.querySelector<HTMLElement>("[data-peers]");
  const button = root?.querySelector<HTMLButtonElement>("[data-peer-jump]");
  const status = root?.querySelector<HTMLElement>("[data-peer-status]");
  const announce = root?.querySelector<HTMLElement>("[data-peer-announce]");
  if (!root || !button || !status || !announce) return;

  const peers = Array.from(root.querySelectorAll<HTMLElement>("[data-peer]"));
  if (peers.length === 0) return;

  // 何回目の抽選か。番号が進んだら、古い回の演出は途中でやめる
  let run = 0;
  let running = false;

  const reset = () => {
    for (const peer of peers) {
      delete peer.dataset.hop;
      delete peer.dataset.picked;
      peer.querySelector("[data-packet]")?.getAnimations().forEach((a) => a.cancel());
    }
    status.textContent = "";
    announce.textContent = "";
  };

  const finish = () => {
    running = false;
    delete button.dataset.running;
  };

  const cancel = () => {
    if (!running) return;
    run++;
    reset();
    finish();
  };

  button.addEventListener("click", async () => {
    if (running) return;
    reset();
    running = true;
    button.dataset.running = "";
    const me = ++run;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const target = pick(peers);
    const anchor = target.querySelector<HTMLAnchorElement>("a[href]");
    if (!anchor) return finish();
    const name = target.dataset.name ?? "";

    // 出現アニメーション待ちの行が光っても見えるようにしておく
    peers.forEach((peer) => peer.classList.add("is-visible"));

    // 1. 経路探索。見えている行の間を渡り歩く
    if (!reduced) {
      const inView = peers.filter((peer) => peer !== target && isInView(peer));
      const hops = inView.length > 1 ? inView : peers.filter((peer) => peer !== target);
      let previous: HTMLElement | undefined;
      for (const delay of HOP_DELAYS) {
        const others = hops.filter((peer) => peer !== previous);
        const hop = others.length > 0 ? pick(others) : target;
        previous = hop;
        status.textContent = `routing… ${hop.dataset.name ?? ""}`;
        hop.dataset.hop = "";
        await wait(delay);
        delete hop.dataset.hop;
        if (me !== run) return;
      }
    }

    // 2. 着地してハンドシェイク
    target.dataset.picked = "";
    if (!isInView(target)) {
      target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
    }

    const packet = target.querySelector<HTMLElement>("[data-packet]");
    if (!reduced && packet) {
      for (const pass of HANDSHAKE) {
        status.textContent = pass.label;
        packet.animate(
          [
            { left: pass.from, opacity: 1 },
            { left: pass.to, opacity: 1 },
          ],
          { duration: PASS_MS, easing: "ease-in-out" },
        );
        // 進行はタイマーで持つ。animation.finished は裏に回ったタブでは解決せず、そこで止まってしまう
        await wait(PASS_MS);
        if (me !== run) return;
      }
    }

    // 3. 開く。"noopener" を引数に渡すと成功しても null が返り、ブロックされたか判定できないので、
    //    空のタブを開いて opener を切ってから移動する
    const opened = window.open("", "_blank");
    if (opened) {
      opened.opener = null;
      opened.location.replace(anchor.href);
      status.textContent = `connected → ${name}`;
      announce.textContent = `${name} を別のタブで開きました`;
    } else {
      anchor.focus({ preventScroll: true });
      status.textContent = `blocked — Enter で開く: ${name}`;
      announce.textContent = `タブがブロックされました。Enter キーで ${name} を開けます`;
    }
    finish();
  });

  // 演出の途中で自分で行を選んだら、抽選は取りやめる
  root.querySelector("ul")?.addEventListener("click", cancel);
  document.addEventListener("astro:before-swap", cancel, { once: true });
}
