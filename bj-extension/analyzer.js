// Bj Beyond Scanner — analyzer engine
// Input: { html, title, url, text } from the active tab
// Output: { score, scores: {seo, conversion, trust, technical, ux}, opportunities: [{title, description, category, impact}], platform }

class WebsiteAnalyzer {
    analyze(page) {
        const doc = new DOMParser().parseFromString(page.html || '', 'text/html');
        const url = page.url || '';
        const text = (page.text || '').toLowerCase();
        const html = (page.html || '').toLowerCase();
        const ctx = { doc, url, text, html, title: page.title || '' };

        this.opportunities = [];
        const scores = {
            seo: this.seo(ctx),
            conversion: this.conversion(ctx),
            trust: this.trust(ctx),
            technical: this.technical(ctx),
            ux: this.ux(ctx)
        };
        const weights = { seo: 0.25, conversion: 0.25, trust: 0.2, technical: 0.15, ux: 0.15 };
        const score = Object.keys(scores).reduce((s, k) => s + scores[k] * weights[k], 0);

        const platform = this.detectPlatform(ctx);
        if (platform === 'Shopify') this.shopifyChecks(ctx);

        const rank = { high: 0, medium: 1, low: 2 };
        this.opportunities.sort((a, b) => rank[a.impact] - rank[b.impact]);

        return { score, scores, opportunities: this.opportunities, platform };
    }

    add(category, impact, title, description) {
        this.opportunities.push({ category, impact, title, description });
    }

    check(points, ok, category, impact, title, description) {
        if (!ok) this.add(category, impact, title, description);
        return ok ? points : 0;
    }

    // ---------- SEO ----------
    seo({ doc, title }) {
        let s = 0;
        const t = title.trim();
        s += this.check(15, t.length > 0, 'seo', 'high', 'Titolo pagina mancante', 'Aggiungi un <title> descrittivo con la keyword principale.');
        if (t) s += this.check(10, t.length >= 30 && t.length <= 60, 'seo', 'medium', 'Lunghezza titolo non ottimale', `Il titolo ha ${t.length} caratteri: resta tra 30 e 60.`);

        const desc = doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || '';
        s += this.check(15, desc.length > 0, 'seo', 'high', 'Meta description mancante', 'Scrivi una meta description di 120–160 caratteri: aumenta il CTR su Google.');
        if (desc) s += this.check(5, desc.length >= 120 && desc.length <= 160, 'seo', 'low', 'Meta description da ottimizzare', `Ha ${desc.length} caratteri: ideale 120–160.`);

        const h1 = doc.querySelectorAll('h1').length;
        s += this.check(15, h1 === 1, 'seo', 'medium', h1 === 0 ? 'Nessun H1' : `${h1} H1 nella pagina`, 'Usa un solo H1 chiaro con la keyword principale.');
        s += this.check(5, doc.querySelectorAll('h2').length > 0, 'seo', 'low', 'Nessun H2', 'Struttura il contenuto con sottotitoli H2.');

        const imgs = [...doc.querySelectorAll('img')];
        const noAlt = imgs.filter(i => !i.getAttribute('alt')?.trim()).length;
        s += this.check(10, imgs.length === 0 || noAlt / imgs.length < 0.2, 'seo', 'medium', `${noAlt} immagini senza alt`, 'Aggiungi testo alt descrittivo: SEO immagini e accessibilità.');

        s += this.check(8, !!doc.querySelector('link[rel="canonical"]'), 'seo', 'medium', 'Canonical mancante', 'Aggiungi <link rel="canonical"> per evitare contenuti duplicati.');
        s += this.check(7, !!doc.querySelector('meta[property="og:title"]') && !!doc.querySelector('meta[property="og:image"]'), 'seo', 'low', 'Open Graph incompleto', 'Aggiungi og:title e og:image per anteprime social migliori.');
        s += this.check(10, !!doc.querySelector('script[type="application/ld+json"]'), 'seo', 'medium', 'Nessun dato strutturato', 'Aggiungi schema.org (JSON-LD) per rich snippet su Google.');
        return Math.min(100, s);
    }

    // ---------- CONVERSION ----------
    conversion({ doc, text }) {
        let s = 0;
        const ctaWords = /(compra|acquista|aggiungi al carrello|iscriviti|contatta|prenota|richiedi|inizia|scarica|buy|shop now|add to cart|sign up|subscribe|get started|book|contact|try|download|order)/i;
        const clickables = [...doc.querySelectorAll('a, button, input[type="submit"]')];
        const ctas = clickables.filter(el => ctaWords.test(el.textContent || el.getAttribute('value') || ''));
        s += this.check(30, ctas.length > 0, 'conversion', 'high', 'Nessuna call-to-action chiara', 'Aggiungi un bottone con azione esplicita (es. "Acquista ora", "Prenota").');

        s += this.check(20, doc.querySelectorAll('form').length > 0 || !!doc.querySelector('input[type="email"]'), 'conversion', 'high', 'Nessun form di contatto o email', 'Aggiungi una cattura email (newsletter, lead magnet) per non perdere visitatori.');

        const urgency = /(offerta|sconto|gratis|spedizione gratuita|solo oggi|limited|free shipping|sale|% off|discount|free)/i.test(text);
        s += this.check(15, urgency, 'conversion', 'medium', 'Nessun incentivo visibile', 'Mostra un\'offerta, spedizione gratuita o bonus per spingere all\'azione.');

        const social = /(recension|review|testimonian|clienti soddisfatti|stelle|rating|★)/i.test(text);
        s += this.check(20, social, 'conversion', 'high', 'Nessuna social proof', 'Mostra recensioni, testimonianze o numero di clienti.');

        const phone = /(\+?\d[\d\s]{7,}\d)/.test(text) || !!doc.querySelector('a[href^="tel:"]') || !!doc.querySelector('a[href*="wa.me"], a[href*="whatsapp"]');
        s += this.check(15, phone, 'conversion', 'low', 'Contatto diretto assente', 'Aggiungi telefono o WhatsApp cliccabile.');
        return Math.min(100, s);
    }

    // ---------- TRUST ----------
    trust({ doc, url, text }) {
        let s = 0;
        s += this.check(30, url.startsWith('https://'), 'trust', 'high', 'Sito senza HTTPS', 'Attiva il certificato SSL: senza HTTPS i browser mostrano "Non sicuro".');
        const links = [...doc.querySelectorAll('a')].map(a => ((a.getAttribute('href') || '') + ' ' + (a.textContent || '')).toLowerCase());
        const has = re => links.some(l => re.test(l));
        s += this.check(20, has(/privacy/), 'trust', 'high', 'Privacy policy mancante', 'Obbligatoria per GDPR: aggiungi il link nel footer.');
        s += this.check(15, has(/cookie/) || /cookie/.test(text), 'trust', 'medium', 'Cookie policy / banner assente', 'Serve un banner cookie conforme GDPR.');
        s += this.check(15, has(/(termini|condizioni|terms)/), 'trust', 'medium', 'Termini e condizioni mancanti', 'Aggiungi termini di servizio / condizioni di vendita.');
        s += this.check(10, has(/(chi siamo|about)/), 'trust', 'low', 'Pagina "Chi siamo" assente', 'Racconta chi c\'è dietro il brand: aumenta la fiducia.');
        s += this.check(10, /(p\.?\s?iva|partita iva|vat)/i.test(text) || has(/(contatt|contact)/), 'trust', 'low', 'Dati aziendali non visibili', 'Mostra P.IVA e contatti nel footer (obbligatorio in Italia per siti aziendali).');
        return Math.min(100, s);
    }

    // ---------- TECHNICAL ----------
    technical({ doc, html }) {
        let s = 0;
        s += this.check(25, !!doc.querySelector('meta[name="viewport"]'), 'technical', 'high', 'Meta viewport mancante', 'Il sito non è ottimizzato per mobile: aggiungi <meta name="viewport">.');
        s += this.check(10, !!doc.documentElement.getAttribute('lang'), 'technical', 'low', 'Attributo lang mancante', 'Aggiungi lang="it" al tag <html>.');
        const scripts = doc.querySelectorAll('script[src]').length;
        s += this.check(20, scripts <= 25, 'technical', 'medium', `${scripts} script esterni`, 'Troppi script rallentano la pagina: rimuovi quelli inutili.');
        const kb = Math.round(html.length / 1024);
        s += this.check(15, kb <= 500, 'technical', 'medium', `HTML pesante (${kb} KB)`, 'Riduci l\'HTML: meno codice inline, meno blocchi nascosti.');
        const imgs = [...doc.querySelectorAll('img')];
        const lazy = imgs.filter(i => i.getAttribute('loading') === 'lazy').length;
        s += this.check(15, imgs.length < 5 || lazy > 0, 'technical', 'medium', 'Immagini senza lazy loading', 'Aggiungi loading="lazy" alle immagini sotto la piega.');
        s += this.check(15, !!doc.querySelector('link[rel*="icon"]'), 'technical', 'low', 'Favicon mancante', 'Aggiungi una favicon: serve anche nei risultati Google mobile.');
        return Math.min(100, s);
    }

    // ---------- UX ----------
    ux({ doc, text }) {
        let s = 0;
        s += this.check(25, !!doc.querySelector('nav, header'), 'ux', 'medium', 'Navigazione non strutturata', 'Usa un <nav>/<header> chiaro con le sezioni principali.');
        s += this.check(15, !!doc.querySelector('footer'), 'ux', 'low', 'Footer assente', 'Un footer con link utili aiuta orientamento e fiducia.');
        const words = text.split(/\s+/).filter(Boolean).length;
        s += this.check(20, words >= 300, 'ux', 'medium', `Poco contenuto (${words} parole)`, 'Almeno 300 parole di valore aiutano utenti e SEO.');
        s += this.check(20, !!doc.querySelector('input[type="search"], form[role="search"], [name="q"]') || words < 1500, 'ux', 'low', 'Ricerca interna assente', 'Con tanti contenuti, una barra di ricerca riduce l\'abbandono.');
        const popups = doc.querySelectorAll('[class*="popup"], [class*="modal"], [id*="popup"]').length;
        s += this.check(20, popups <= 3, 'ux', 'low', 'Molti popup/modal', 'Troppi popup peggiorano l\'esperienza e il ranking mobile.');
        return Math.min(100, s);
    }

    // ---------- PLATFORM ----------
    detectPlatform({ html }) {
        if (html.includes('cdn.shopify.com') || html.includes('shopify.theme') || html.includes('myshopify.com')) return 'Shopify';
        if (html.includes('woocommerce')) return 'WooCommerce';
        if (html.includes('wp-content') || html.includes('wp-includes')) return 'WordPress';
        if (html.includes('wixstatic') || html.includes('wix.com')) return 'Wix';
        if (html.includes('squarespace')) return 'Squarespace';
        if (html.includes('webflow')) return 'Webflow';
        return null;
    }

    shopifyChecks({ doc, html, text }) {
        if (!/(judge\.me|loox|yotpo|okendo|stamped|reviews)/i.test(html)) this.add('conversion', 'high', 'Shopify: nessuna app recensioni', 'Installa Judge.me o Loox: le recensioni prodotto alzano le conversioni.');
        if (!/(klaviyo|omnisend|mailchimp|newsletter)/i.test(html)) this.add('conversion', 'medium', 'Shopify: email marketing assente', 'Collega Klaviyo o Shopify Email per carrelli abbandonati e flussi automatici.');
        if (!/(spedizione gratuita|free shipping)/i.test(text)) this.add('conversion', 'medium', 'Shopify: soglia spedizione gratuita', 'Mostra "Mancano X€ alla spedizione gratuita" per alzare lo scontrino medio.');
        if (!doc.querySelector('script[type="application/ld+json"]')) this.add('seo', 'medium', 'Shopify: schema Product assente', 'Aggiungi schema Product con prezzo e disponibilità per rich snippet.');
    }
}
