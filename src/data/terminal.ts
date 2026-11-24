// /about のミニターミナルで打てるコマンドの定義。
// ここだけ触ればコマンドを増やせる(ターミナルの動き本体は src/scripts/terminal.ts)。
//
// コマンドは 2 種類ある。
//   1. 組み込み(builtins) … help / clear / fastfetch / music。名前を打つと動作が走る。
//   2. おまけ(terminalCommands) … 打った文字が cmd と同じなら、out をそのまま返すだけの小ネタ。
//      トップのヒーローにあった「ランダムに 3 行出すミニターミナル」の中身を、そのまま引き継いでいる。
//      イースターエッグも含むので、help ではあえて全部は教えない。

// =====================================================
// 組み込みコマンド
// =====================================================
export type BuiltinAction = "help" | "clear" | "fastfetch" | "music";

export interface BuiltinCommand {
  /** 打つ名前。Tab 補完の候補にもなる */
  name: string;
  /** 別名(補完の候補には出さない) */
  aliases?: string[];
  /** help に出す説明 */
  desc: string;
  action: BuiltinAction;
}

export const builtins: BuiltinCommand[] = [
  { name: "help", aliases: ["?", "man"], desc: "使えるコマンドの一覧", action: "help" },
  { name: "fastfetch", aliases: ["neofetch"], desc: "プロフィールをもう一度表示", action: "fastfetch" },
  { name: "music", aliases: ["play", "play --random"], desc: "今日の一曲を抽選(Today's Music)", action: "music" },
  { name: "clear", aliases: ["cls"], desc: "画面をきれいにする(Ctrl+L)", action: "clear" },
];

/** help の最後に添える、隠しコマンドがあることのヒント */
export const HELP_HINT = "ほかにも、いろいろ隠れています。 例: whoami / cat hobby / fortune / cat arch";

// =====================================================
// 見つからなかったとき・特別な反応
// =====================================================
/** 知らないコマンドを打ったとき。cmd は打った文字の最初の単語 */
export const notFound = (cmd: string) => `command not found: ${cmd}  (help でコマンド一覧)`;

/** sudo を付けて、おまけにない組み合わせを打ったとき */
export const SUDO_DENIED = "toramutton is not in the sudoers file. This incident will be reported.";

// =====================================================
// おまけコマンド(元・ヒーロー左側のミニターミナル)
// =====================================================
export interface TerminalCommand {
  cmd: string;
  out: string;
  /** 指定すると、出力がこのURLへのリンクになる（イースターエッグ用） */
  href?: string;
}

export const terminalCommands: TerminalCommand[] = [
  { cmd: "whoami", out: "toramutton" },
  { cmd: "status", out: "studying" },
  { cmd: "mood", out: "creating something" },
  { cmd: "cat major", out: "CS @ UEC" },
  { cmd: "cat os", out: "Arch Linux / Windows 11" },
  { cmd: "echo $SHELL", out: "/bin/bash" },
  { cmd: "cat hobby", out: "Twitter / Anime / Music" },
  { cmd: "git status", out: "on branch: main" },
  { cmd: "pwd", out: "/home/toramutton" },
  { cmd: "echo $LANG", out: "ja_JP.UTF-8" },
  { cmd: "cat skills", out: "Rust / TypeScript / C" },
  { cmd: "cat editor", out: "Zed" },
  { cmd: "echo $WM", out: "Hyprland / GlazeWM" },
  { cmd: "cat focus", out: "web / compilers / LLM" },
  { cmd: "fortune", out: "多分動くと思うからリリースしようぜ" },
  { cmd: "cat music", out: "米津玄師 / Eve / ヨルシカ" },
  { cmd: "ping life", out: "64 bytes: icmp_seq=1 ttl=64" },
  { cmd: "cat dream", out: "living happy!" },
  { cmd: "cat gpa", out: "it's fine" },
  { cmd: "cat sleep", out: "insufficient" },
  { cmd: "git log --oneline", out: "abc1234 fix: everything" },
  { cmd: "cat arch", out: "I use Arch btw" },
  { cmd: "cat bugs", out: "feature" },
  // イースターエッグ。出力をクリックすると古き良きホームページへ飛べる
  { cmd: "cd /retro", out: "→ 古き良きホームページへ", href: "/retro/" },
  { cmd: "sudo make me a sandwich", out: "Okay." },
  {
    cmd: "rm -rf laziness",
    out: "Permission denied: It's part of your identity",
  },
  { cmd: "cat motivation", out: "depends on the day" },
  { cmd: "uptime", out: "2 years at UEC" },
  { cmd: "ls projects", out: "too many" },
  { cmd: "man life", out: "No manual entry for life" },
  { cmd: "cat girlfriend", out: "404 Not Found" },
  { cmd: "cat regrets", out: "3DS" },
  { cmd: "git diff lunch", out: "no changes. still udon." },
  { cmd: "locate meme", out: "found before you finished asking" },
  { cmd: "which interest", out: "ask me again next month" },
  { cmd: "gcc exam.c", out: "Please use a pencil." },
  { cmd: "sudo reboot", out: "please come back" },
  { cmd: "cat day.conf", out: "hours = 27 # powered by Gemini" },
];
