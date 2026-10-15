import Link from 'next/link';
import Image from 'next/image';
import { ArrowDownToLine, ArrowRight, AudioLines, Check, Database, Disc3, FolderOpen, Gauge, Headphones, ListMusic, LockKeyhole, Search, ShieldCheck, Sparkles } from 'lucide-react';
import release from '../public/downloads/latest.json';

const features = [
  { icon: FolderOpen, title: '添加本地音乐目录', text: '选择电脑或外接存储中的音乐文件夹，nanoPlayer 会扫描并更新曲库。' },
  { icon: Database, title: '按音乐信息浏览', text: '从歌曲、专辑和艺术家查看本地收藏，并保留评分与播放记录。' },
  { icon: Search, title: '搜索本地曲库', text: '通过歌曲、艺术家或专辑名称搜索，也可在歌曲列表中排序和批量选择。' },
  { icon: AudioLines, title: '播放与同步歌词', text: '支持播放队列、随机和循环模式、桌面输出设备切换，本地与可选网络歌词、逐字时间轴及歌词偏移。' },
  { icon: ListMusic, title: '歌单与收听记录', text: '创建和调整歌单，为歌曲评分，并按最近播放或播放次数查看音乐。' },
  { icon: ShieldCheck, title: '不修改源音频', text: '应用只读取选定的音乐路径。移除目录时只删除应用索引，不删除音频文件。' },
];

const formats = ['MP3', 'FLAC', 'M4A / AAC', 'ALAC', 'WAV', 'Ogg Vorbis', 'Opus', 'AIFF'];

export default function NanoHome() {
  const availablePlatforms = Object.entries(release.platforms)
    .filter(([, assets]) => assets.length > 0)
    .map(([platform]) => ({ macos: 'macOS', windows: 'Windows', linux: 'Linux' })[platform]);

  return (
    <main className="site-shell">
      <header className="site-header">
        <Link className="site-brand" href="/" aria-label="nanoPlayer 首页"><span>nano</span>Player</Link>
        <nav aria-label="网站导航">
          <a href="#experience">展示</a>
          <a href="#features">功能</a>
          <a href="#privacy">隐私</a>
          <Link className="nav-download" href="/download">下载</Link>
        </nav>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="kicker"><Disc3 size={14} /> LOCAL MUSIC PLAYER <span className="version-chip">v{release.version}</span></p>
          <h1>播放你电脑里的<br />本地音乐。</h1>
          <p className="hero-text">nanoPlayer 已接入桌面、Android 与 iPhone / iPad。按歌曲、专辑和艺术家浏览本地收藏，使用歌单、评分、播放队列与同步歌词。桌面版已开放下载，移动版仍在测试验收。</p>
          <div className="hero-actions">
            <Link className="primary-link" href="/download">下载最新版 <ArrowDownToLine size={16} /></Link>
            <a className="secondary-link" href="#experience">看看界面</a>
          </div>
          <div className="hero-trust"><span><Check size={14} /> 本地播放</span><span><Check size={14} /> 源文件只读</span><span><Check size={14} /> 无需账号</span></div>
        </div>

        <div className="hero-visual" id="experience">
          <div className="app-frame">
            <div className="frame-bar"><i /><i /><i /><span>nanoPlayer</span></div>
            <Image src="/product-home-current.png" alt="nanoPlayer 实际应用首页，展示最近添加、播放最多、高评分歌曲和播放控件" width={1440} height={960} priority />
          </div>
          <div className="visual-caption"><Sparkles size={15} /> 2026-10-15 · v0.1.23 共享界面 · 浏览器演示数据</div>
        </div>
      </section>

      <section className="release-bar" aria-label="当前版本">
        <div><span className="release-dot" /><p><strong>v{release.version} 已发布</strong><span>{availablePlatforms.filter(Boolean).join('、')} 安装包现已开放下载</span></p></div>
        <Link href="/download">查看版本与校验信息 <ArrowRight size={15} /></Link>
      </section>

      <section className="principles" aria-label="产品原则">
        <article><LockKeyhole /><div><strong>数据存在本机</strong><span>曲库索引、歌单、评分与播放记录保存在应用数据目录</span></div></article>
        <article><Gauge /><div><strong>自动更新曲库</strong><span>对已添加目录进行增量扫描，记录无法读取的文件</span></div></article>
        <article><Headphones /><div><strong>完整的本地播放界面</strong><span>包含播放控制、队列、音量、歌词和输出设备选择</span></div></article>
      </section>

      <section className="feature-section" id="features">
        <div className="section-heading"><div><p className="kicker">LOCAL LIBRARY FEATURES</p><h2>本地曲库所需的播放和管理功能。</h2></div><p>nanoPlayer 读取现有音乐目录，建立本机索引。原始音频保持在原位，歌单和评分由应用单独保存。</p></div>
        <div className="feature-grid">
          {features.map(({ icon: Icon, title, text }, index) => (
            <article key={title}><span className="feature-number">0{index + 1}</span><Icon aria-hidden="true" size={22} /><h3>{title}</h3><p>{text}</p></article>
          ))}
        </div>
      </section>

      <section className="feature-section" id="clients">
        <div className="section-heading"><div><p className="kicker">DESKTOP · PHONE · PAD</p><h2>同一个音乐库体验，适配不同屏幕。</h2></div><p>截至 2026-10-15：桌面 v{release.version} 已发布；Android 和 iOS/iPadOS 已有本地测试构建，尚未公开分发。以下为 v0.1.23 共享 UI 的浏览器演示截图，不代表真机播放验收。</p></div>
        <div className="client-gallery">
          <article><h3>Android 手机 / Pad</h3><p>SAF 目录授权、原生播放队列、后台会话与睡眠定时器。当前 APK 的真机与长时验收仍待完成。</p><Image src="/product-android-current.png" alt="Android 手机共享首页预览，使用演示歌曲" width={390} height={844} /></article>
          <article><h3>iPhone</h3><p>nanoPlayer、Files、其他音乐 App 三类来源。外部音乐只读引用或复制，自有管理区支持文件夹与批量移动。</p><Image src="/product-iphone-current.png" alt="iPhone 三类资料库的共享界面预览" width={390} height={844} /></article>
          <article className="client-pad"><h3>iPad</h3><p>适配侧栏和窄分屏。模拟器导航与文件夹操作已验证；真实 Files/provider、前台 Wi-Fi 上传、后台音频仍待真机验收。未发布 TestFlight。</p><Image src="/product-ipad-current.png" alt="iPad 资料库与文件管理共享界面预览" width={1024} height={900} /></article>
        </div>
      </section>

      <section className="format-section">
        <div><p className="kicker">SUPPORTED FORMATS</p><h2>支持常见的本地音频格式。</h2></div>
        <div className="format-list">{formats.map((format) => <span key={format}>{format}</span>)}</div>
      </section>

      <section className="privacy-section" id="privacy">
        <div className="privacy-mark"><ShieldCheck size={34} /></div>
        <div className="privacy-copy"><p className="kicker">READ-ONLY SOURCE FILES</p><h2>外部音乐只读，自有资料库可整理。</h2><p>外部授权目录和导入源保持只读；移除资料库只删除索引。iOS 可在应用 Documents/Music 内新建、重命名和移动自有文件，外部音频仅复制导入。在线歌词默认关闭，开启查询时会向 LRCLIB 发送歌曲、艺术家等匹配信息。</p></div>
        <ul><li><Check /> 外部音频不删除</li><li><Check /> 无标签改写</li><li><Check /> 本机 SQLite 资料库</li><li><Check /> 可选的网络歌词</li></ul>
      </section>

      <section className="closing-cta">
        <div><p className="kicker">NANOPLAYER {release.version}</p><h2>让自己的音乐，始终属于自己。</h2><p>v{release.version} 已提供 {availablePlatforms.filter(Boolean).join('、')} 安装包。当前版本尚未完成平台签名，请先阅读下载页的安装说明。</p></div>
        <Link className="primary-link light" href="/download">前往下载 <ArrowRight size={16} /></Link>
      </section>
      <footer className="site-footer"><span className="site-brand"><span>nano</span>Player</span><span>本地音乐播放器 · 外部源文件只读</span><span>© 2026 nanoPlayer</span></footer>
    </main>
  );
}
