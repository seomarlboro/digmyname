interface RegistrarColor {
  bg: string;
  text: string;
  border: string;
  dot: string;
}

const REGISTRAR_DOMAIN_URLS: Record<string, (domain: string) => string> = {
  Cloudflare: (d) => `https://www.cloudflare.com/products/registrar/`,
  GoDaddy: (d) => `https://www.godaddy.com/domainsearch/find?domainToCheck=${encodeURIComponent(d)}`,
  OVHcloud: (d) => `https://www.ovhcloud.com/en/domains/results/?domain=${encodeURIComponent(d)}`,
  "Google Domains": (d) => `https://domains.google/registrar/?searchTerm=${encodeURIComponent(d)}`,
  Porkbun: (d) => `https://porkbun.com/checkout/search?q=${encodeURIComponent(d)}`,
  Spaceship: (d) => `https://www.spaceship.com/domain/search/?query=${encodeURIComponent(d)}`,
  Namecheap: (d) => `https://www.namecheap.com/domains/registration/results/?domain=${encodeURIComponent(d)}`,
};

export const getRegistrarUrl = (registrar: string, domain?: string): string => {
  const fn = REGISTRAR_DOMAIN_URLS[registrar];
  if (fn && domain) return fn(domain);
  return "https://www.google.com/search?q=" + encodeURIComponent((domain ?? "") + " " + registrar + " register");
};

const REGISTRAR_COLORS: Record<string, RegistrarColor> = {
  Cloudflare: { bg: "bg-[#f6821f]/15", text: "text-[#f6821f]", border: "border-[#f6821f]/30", dot: "bg-[#f6821f]" },
  GoDaddy: { bg: "bg-[#00a63f]/15", text: "text-[#00a63f]", border: "border-[#00a63f]/30", dot: "bg-[#00a63f]" },
  OVHcloud: { bg: "bg-[#000e9c]/15", text: "text-[#6b7aff]", border: "border-[#6b7aff]/30", dot: "bg-[#6b7aff]" },
  "Google Domains": { bg: "bg-[#4285f4]/15", text: "text-[#4285f4]", border: "border-[#4285f4]/30", dot: "bg-[#4285f4]" },
  Porkbun: { bg: "bg-[#f17ca2]/15", text: "text-[#f17ca2]", border: "border-[#f17ca2]/30", dot: "bg-[#f17ca2]" },
  Spaceship: { bg: "bg-[#7c6cf0]/15", text: "text-[#7c6cf0]", border: "border-[#7c6cf0]/30", dot: "bg-[#7c6cf0]" },
  Namecheap: { bg: "bg-[#de5833]/15", text: "text-[#de5833]", border: "border-[#de5833]/30", dot: "bg-[#de5833]" },
};

const DEFAULT_COLOR: RegistrarColor = {
  bg: "bg-primary/10",
  text: "text-primary",
  border: "border-primary/20",
  dot: "bg-primary",
};

export const getRegistrarColor = (registrar: string): RegistrarColor =>
  REGISTRAR_COLORS[registrar] ?? DEFAULT_COLOR;
