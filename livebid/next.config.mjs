/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Type-checking still runs during build; ESLint config is optional here.
  eslint: { ignoreDuringBuilds: true },
  // Product photos and top-up slips can be a few MB.
  experimental: {
    serverActions: {
      bodySizeLimit: "15mb",
    },
  },
};

export default nextConfig;
