/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',           // ← this is mandatory for static export
  // basePath is very important for subfolder deployment
  basePath: '/vo-account-creation-page',   // ← must match your repo name exactly
  assetPrefix: '/vo-account-creation-page/', // some people only need this one
  images: {
    unoptimized: true,        // ← GitHub Pages doesn't support Next Image optimization
  },
};

export default nextConfig;
