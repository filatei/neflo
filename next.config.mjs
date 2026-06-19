/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Keep the client bundle lean for low-bandwidth villages.
  experimental: {
    serverActions: {
      bodySizeLimit: "1mb",
    },
  },
  // Keep heavy server-only deps out of the client/runtime trace.
  serverExternalPackages: ["ethers"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
