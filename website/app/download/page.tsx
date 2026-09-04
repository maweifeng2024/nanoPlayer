import type { Metadata } from 'next';
import Link from 'next/link';
import { Apple, ArrowLeft, CheckCircle2, Clock3, MonitorDown, ShieldCheck, Terminal } from 'lucide-react';
import release from '../../public/downloads/latest.json';

export const metadata: Metadata = {
  title: '下载',
  description: '下载 nanoPlayer macOS 测试版，并查看各平台构建状态。',
};

const platforms = [
  { key: 'macos' as const, icon: Apple, name: 'macOS', requirement: 'macOS 12 或更高版本' },
  { key: 'windows' as const, icon: MonitorDown, name: 'Windows', requirement: 'Windows 10 或更高版本' },
  { key: 'linux' as const, icon: Terminal, name: 'Linux', requirement: '主流 64 位发行版' },
];

function formatSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function DownloadPage() {
  return (
    <main className="download-shell">
      <header className="download-header">
        <Link href="/"><ArrowLeft size={16} />返回首页</Link>
        <Link className="site-brand" href="/"><span>nano</span>Player</Link>
      </header>
      <section className="download-intro">
        <p className="kicker">DOWNLOADS</p>
        <h1>下载 nanoPlayer</h1>
        <p>当前发布 v{release.version}，所有下载地址与 GitHub Release 中的已校验构建产物同步。</p>
        {!release.signed && <div className="status-notice"><Clock3 size={18} /><div><strong>未签名版本</strong><span>安装包已生成 SHA-256 校验值，但尚未完成平台签名或 Apple 公证，首次打开可能触发系统安全提示。</span></div></div>}
      </section>
      <section className="platform-grid" aria-label="平台下载状态">
        {platforms.map(({ key, icon: Icon, name, requirement }) => (
          <article key={name} className={release.platforms[key].length > 0 ? 'active' : 'planned'}>
            <div className="platform-icon"><Icon aria-hidden="true" size={24} /></div>
            <div className="platform-title"><h2>{name}</h2><span>{release.platforms[key].length > 0 ? '可下载' : '等待构建'}</span></div>
            <p>{release.platforms[key].map((asset) => asset.format).join(' / ') || '尚无已验证安装包'}</p>
            <small>{requirement}</small>
            {release.platforms[key].map((asset) => <a className="download-button" href={asset.url} key={asset.name}>{asset.format} · {formatSize(asset.size)}</a>)}
            {release.platforms[key].length === 0 && <button aria-disabled="true" disabled type="button">暂未开放下载</button>}
          </article>
        ))}
      </section>
      <section className="release-trust">
        <h2>每个公开版本都需要经过</h2>
        <ul>
          <li><CheckCircle2 size={17} />安装包签名与平台验证</li>
          <li><CheckCircle2 size={17} />SHA-256 校验文件</li>
          <li><CheckCircle2 size={17} />真实系统安装、升级和卸载测试</li>
          <li><CheckCircle2 size={17} />源音乐目录只读回归检查</li>
        </ul>
      </section>
      <section className="download-safety"><ShieldCheck /><p><strong>核对安装包完整性</strong><span>每个文件的 SHA-256 均记录在 <a href={release.checksumsUrl}>SHA256SUMS.txt</a> 中；完整发布说明见 <a href={release.releaseUrl}>GitHub Release</a>。</span></p></section>
      <footer className="site-footer"><span>nanoPlayer</span><span>版本状态与安装包保持同步</span></footer>
    </main>
  );
}
