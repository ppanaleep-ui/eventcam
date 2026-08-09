/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // ESLint is optional for this project; type-checking still runs during build.
  eslint: { ignoreDuringBuilds: true },
  // Guest photos and slips can be a few MB; allow larger server action / route bodies.
  experimental: {
    serverActions: {
      bodySizeLimit: "15mb",
    },
  },
};

export default nextConfig;
