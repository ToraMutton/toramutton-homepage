// 記事ページのいいねボタン。同じ記事のボタン(左の縦並びと本文の下)は、まとめて同じ状態にする。
// 「自分が押したか」はこのブラウザの localStorage だけで覚える。
// 数を取れなかった場合(DB 未設定・通信失敗)は、ボタンを出さない。

type Reply = { enabled?: boolean; count?: number };

const read = (key: string) => {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};
const write = (key: string, liked: boolean) => {
  try {
    if (liked) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {
    /* 保存できない環境では、再読み込みで忘れる */
  }
};

export function initLikes(): void {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-like]:not([data-like-ready])"));
  if (buttons.length === 0) return;
  buttons.forEach((button) => (button.dataset.likeReady = ""));

  const slug = buttons[0].dataset.like ?? "";
  const url = `/api/likes/${encodeURIComponent(slug)}`;
  const key = `liked:${slug}`;
  let liked = read(key);
  let count = 0;
  let pending = false;

  const render = () => {
    for (const button of buttons) {
      button.setAttribute("aria-pressed", String(liked));
      button.setAttribute("aria-label", `いいね(${count})`);
      button.querySelector("[data-like-count]")!.textContent = String(count);
    }
  };

  const request = async (method: string): Promise<number> => {
    const response = await fetch(url, {
      method,
      // 中身は要らないが、JSON と名乗っておくと別サイトからは送れない(CORS の事前確認が必要になる)
      ...(method === "GET" ? {} : { headers: { "Content-Type": "application/json" }, body: "{}" }),
    });
    const data = (await response.json()) as Reply;
    if (!response.ok || !data.enabled || typeof data.count !== "number") throw new Error("likes unavailable");
    return data.count;
  };

  request("GET").then(
    (value) => {
      count = value;
      render();
      buttons.forEach((button) => button.classList.remove("is-loading"));
    },
    () => buttons.forEach((button) => (button.hidden = true)),
  );

  for (const button of buttons) {
    button.addEventListener("animationend", () => button.classList.remove("is-popping"));
    button.addEventListener("click", async () => {
      if (pending) return;
      pending = true;
      const before = { liked, count };

      // 返事を待たずに見た目を変える。失敗したら戻す
      liked = !liked;
      count = Math.max(0, count + (liked ? 1 : -1));
      if (liked) button.classList.add("is-popping");
      render();

      try {
        count = await request(liked ? "POST" : "DELETE");
        write(key, liked);
      } catch {
        ({ liked, count } = before);
      }
      render();
      pending = false;
    });
  }
}
