import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'http://localhost:3000',
  ),
  title: {
    default: 'nanoPlayer — 本地音乐播放器',
    template: '%s · nanoPlayer',
  },
  description: '添加本地音乐文件夹，浏览歌曲、专辑和艺术家，使用歌单、评分、播放队列和歌词。',
  openGraph: {
    title: 'nanoPlayer — 本地音乐播放器',
    description: '用于播放和管理电脑本地歌曲的桌面应用。',
    type: 'website',
    images: [{ url: '/product-home-current.png', width: 1132, height: 756, alt: 'nanoPlayer 当前应用界面' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'nanoPlayer — 本地音乐播放器',
    description: '用于播放和管理电脑本地歌曲的桌面应用。',
    images: ['/product-home-current.png'],
  },
  icons: { icon: '/nanoplayer.svg' },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
