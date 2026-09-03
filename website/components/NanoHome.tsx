import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, AudioLines, Check, Database, Disc3, FolderOpen, Gauge, Headphones, ListMusic, LockKeyhole, Search, ShieldCheck, Sparkles } from 'lucide-react';

const features = [
  { icon: FolderOpen, title: '添加本地音乐目录', text: '选择电脑或外接存储中的音乐文件夹，nanoPlayer 会扫描并更新曲库。' },
  { icon: Database, title: '按音乐信息浏览', text: '从歌曲、专辑、艺术家和流派查看本地收藏，并保留评分与播放记录。' },
  { icon: Search, title: '搜索本地曲库', text: '通过歌曲、艺术家或专辑名称搜索，也可在歌曲列表中排序和批量选择。' },
  { icon: AudioLines, title: '播放与同步歌词', text: '支持播放队列、随机和循环模式、输出设备切换，以及本地和可选网络歌词。' },
  { icon: ListMusic, title: '歌单与收听记录', text: '创建和调整歌单，为歌曲评分，并按最近播放或播放次数查看音乐。' },
  { icon: ShieldCheck, title: '不修改源音频', text: '应用只读取选定的音乐路径。移除目录时只删除应用索引，不删除音频文件。' },
];

const formats = ['MP3', 'FLAC', 'M4A / AAC', 'ALAC', 'WAV', 'Ogg Vorbis', 'Opus', 'AIFF'];

export default function NanoHome() {
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
          <p className="kicker"><Disc3 size={14} /> LOCAL MUSIC PLAYER</p>
          <h1>播放你电脑里的<br />本地音乐。</h1>
          <p className="hero-text">nanoPlayer 是一款桌面本地音乐播放器。添加音乐文件夹后，可以按歌曲、专辑和艺术家浏览，并使用歌单、评分、播放队列和歌词。</p>
          <div className="hero-actions">
            <Link className="primary-link" href="/download">查看下载状态 <ArrowRight size={16} /></Link>
            <a className="secondary-link" href="#experience">看看界面</a>
          </div>
          <div className="hero-trust"><span><Check size={14} /> 本地播放</span><span><Check size={14} /> 源文件只读</span><span><Check size={14} /> 无需账号</span></div>
        </div>

        <div className="hero-visual" id="experience">
          <div className="app-frame">
            <div className="frame-bar"><i /><i /><i /><span>nanoPlayer</span></div>
            <Image src="/product-home.png" alt="nanoPlayer 当前应用首页，展示本地曲库、最近添加和播放控件" width={1280} height={720} priority />
          </div>
          <div className="visual-caption"><Sparkles size={15} /> 当前应用实际界面</div>
        </div>
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

      <section className="format-section">
        <div><p className="kicker">SUPPORTED FORMATS</p><h2>支持常见的本地音频格式。</h2></div>
        <div className="format-list">{formats.map((format) => <span key={format}>{format}</span>)}</div>
      </section>

      <section className="privacy-section" id="privacy">
        <div className="privacy-mark"><ShieldCheck size={34} /></div>
        <div className="privacy-copy"><p className="kicker">READ-ONLY SOURCE FILES</p><h2>播放和整理时，不改写音频文件。</h2><p>应用只扫描通过系统文件夹选择器添加的路径。移除目录时，删除的是应用内的索引和缓存，不是源音频。在线歌词默认关闭，需要时可在设置中开启。</p></div>
        <ul><li><Check /> 无源文件删除命令</li><li><Check /> 无标签改写</li><li><Check /> 本机 SQLite 资料库</li><li><Check /> 可选的网络歌词</li></ul>
      </section>

      <section className="closing-cta">
        <div><p className="kicker">NANOPLAYER PREVIEW</p><h2>下载当前 macOS 测试版。</h2><p>现提供 Apple Silicon v0.1.0 测试安装包；Windows 版本仍在准备中。</p></div>
        <Link className="primary-link light" href="/download">前往下载 <ArrowRight size={16} /></Link>
      </section>
      <footer className="site-footer"><span className="site-brand"><span>nano</span>Player</span><span>本地音乐播放器 · 源文件只读</span><span>© 2026 nanoPlayer</span></footer>
    </main>
  );
}
