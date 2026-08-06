interface RegistrarColor {
  bg: string;
  text: string;
  border: string;
  dot: string;
}

const REGISTRAR_DOMAIN_URLS: Record<string, (domain: string) => string> = {
  Cloudflare: (d) => `https://www.cloudflare.com/products/registrar/`,
  GoDaddy: (d) => `https://www.godaddy.com/domainsearch/find?domainToCheck=${encodeURIComponent(d)}`,
  OVHcloud: (d) => `https://order.ca.ovhcloud.com/us/order/webcloud/?#/webCloud/domain/select?selection=~()&domain=${encodeURIComponent(d)}`,
  Porkbun: (d) => `https://porkbun.com/checkout/search?q=${encodeURIComponent(d)}`,
  Spaceship: (d) => `https://www.spaceship.com/domain-search/?query=${encodeURIComponent(d)}`,
  Namecheap: (d) => `https://www.namecheap.com/domains/registration/results/?domain=${encodeURIComponent(d)}`,
};

export const getRegistrarUrl = (registrar: string, domain?: string): string => {
  const fn = REGISTRAR_DOMAIN_URLS[registrar];
  if (fn && domain) return fn(domain);
  return "https://www.google.com/search?q=" + encodeURIComponent((domain ?? "") + " " + registrar + " register");
};

const REGISTRAR_COLORS: Record<string, RegistrarColor> = {
  Cloudflare: { bg: "bg-registrar-cloudflare/15", text: "text-registrar-cloudflare", border: "border-registrar-cloudflare/30", dot: "bg-registrar-cloudflare" },
  GoDaddy: { bg: "bg-registrar-godaddy/15", text: "text-registrar-godaddy", border: "border-registrar-godaddy/30", dot: "bg-registrar-godaddy" },
  OVHcloud: { bg: "bg-registrar-ovhcloud-surface/15", text: "text-registrar-ovhcloud", border: "border-registrar-ovhcloud/30", dot: "bg-registrar-ovhcloud" },
  Porkbun: { bg: "bg-registrar-porkbun/15", text: "text-registrar-porkbun", border: "border-registrar-porkbun/30", dot: "bg-registrar-porkbun" },
  Spaceship: { bg: "bg-registrar-spaceship/15", text: "text-registrar-spaceship", border: "border-registrar-spaceship/30", dot: "bg-registrar-spaceship" },
  Namecheap: { bg: "bg-registrar-namecheap/15", text: "text-registrar-namecheap", border: "border-registrar-namecheap/30", dot: "bg-registrar-namecheap" },
};

const DEFAULT_COLOR: RegistrarColor = {
  bg: "bg-primary/10",
  text: "text-primary",
  border: "border-primary/20",
  dot: "bg-primary",
};

export const getRegistrarColor = (registrar: string): RegistrarColor =>
  REGISTRAR_COLORS[registrar] ?? DEFAULT_COLOR;
