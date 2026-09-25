/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost", port: "4000", pathname: "/uploads/**" },
      { protocol: "http", hostname: "82.112.236.82", port: "", pathname: "/uploads/**" },
    ],
  },
};
export default nextConfig;
