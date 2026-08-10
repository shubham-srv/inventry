import * as React from "react"
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Heading,
  Text,
  Hr,
  Button,
  Img,
} from "@react-email/components"
import type { TFunction } from "@/lib/i18n/translate"

/**
 * Absolute URL for the logo. Email clients have no page context, so a relative
 * path resolves to nothing — in a real inbox AND in the Outbox preview iframe,
 * which renders the stored HTML via srcDoc.
 *
 * PNG, not the app's WebP: Outlook and several other clients won't render WebP.
 */
const LOGO_URL = `${
  process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
}/logo-email.png`

// ============================================================
// One shared, data-driven email used for every notification.
// Copy is passed in already-translated (the caller builds it with
// makeT(recipientLocale)), so this component itself is i18n-agnostic —
// React Email handles presentation only.
// ============================================================

export type EmailDetail = { label: string; value: string }
export type EmailVariant = "info" | "success" | "warning"

export type NotificationEmailProps = {
  t: TFunction
  lang: string
  preview: string
  heading: string
  intro: string
  details?: EmailDetail[]
  note?: string | null
  cta?: { label: string; href: string } | null
  variant?: EmailVariant
}

// Brand palette. `info` is the brand green so the default email reads as
// company mail; success/warning come from the style-guide accents. Red is
// deliberately absent — it stays reserved for danger in the app, and an alarming
// header colour on a routine "submission received" would train people to ignore it.
const ACCENT: Record<EmailVariant, string> = {
  info: "#004C43", // brand green
  success: "#4FA78B",
  warning: "#F58C35",
}

export function NotificationEmail({
  t,
  lang,
  preview,
  heading,
  intro,
  details,
  note,
  cta,
  variant = "info",
}: NotificationEmailProps) {
  const accent = ACCENT[variant]
  return (
    <Html lang={lang}>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.outer}>
          <Section style={{ ...styles.accentBar, backgroundColor: accent }} />
          <Section style={styles.card}>
            {/* Remote images are blocked by default in Outlook and others, so the
                logo carries alt text that reads as the wordmark. A blocked image
                then degrades to the brand name rather than an empty box. */}
            <Img
              src={LOGO_URL}
              alt={t("email.brand")}
              width="180"
              height="98"
              style={styles.logo}
            />
            <Heading style={styles.heading}>{heading}</Heading>
            <Text style={styles.intro}>{intro}</Text>

            {details && details.length > 0 && (
              <Section style={styles.details}>
                {details.map((d, i) => (
                  <Text key={i} style={styles.detailRow}>
                    <span style={styles.detailLabel}>{d.label}: </span>
                    <span style={styles.detailValue}>{d.value}</span>
                  </Text>
                ))}
              </Section>
            )}

            {note ? <Text style={styles.note}>{note}</Text> : null}

            {cta ? (
              <Section style={styles.ctaWrap}>
                <Button href={cta.href} style={{ ...styles.button, backgroundColor: accent }}>
                  {cta.label}
                </Button>
              </Section>
            ) : null}

            <Hr style={styles.hr} />
            <Text style={styles.footer}>{t("email.footer")}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

const styles: Record<string, React.CSSProperties> = {
  body: {
    backgroundColor: "#f1f5f9",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    margin: 0,
    padding: "24px 0",
  },
  outer: {
    maxWidth: "560px",
    margin: "0 auto",
  },
  accentBar: {
    height: "4px",
    borderTopLeftRadius: "12px",
    borderTopRightRadius: "12px",
  },
  card: {
    backgroundColor: "#ffffff",
    borderBottomLeftRadius: "12px",
    borderBottomRightRadius: "12px",
    padding: "32px",
    border: "1px solid #e2e8f0",
    borderTop: "none",
  },
  logo: {
    display: "block",
    width: "180px",
    height: "auto",
    margin: "0 0 20px",
  },
  heading: {
    margin: "0 0 12px",
    fontSize: "20px",
    lineHeight: "28px",
    fontWeight: 700,
    color: "#0f172a",
  },
  intro: {
    margin: "0 0 16px",
    fontSize: "15px",
    lineHeight: "24px",
    color: "#334155",
  },
  details: {
    backgroundColor: "#f8fafc",
    borderRadius: "8px",
    padding: "12px 16px",
    margin: "0 0 8px",
  },
  detailRow: {
    margin: "4px 0",
    fontSize: "14px",
    lineHeight: "20px",
    color: "#334155",
  },
  detailLabel: {
    color: "#64748b",
  },
  detailValue: {
    fontWeight: 600,
    color: "#0f172a",
  },
  note: {
    margin: "12px 0 0",
    fontSize: "14px",
    lineHeight: "22px",
    color: "#334155",
    fontStyle: "italic",
  },
  ctaWrap: {
    marginTop: "24px",
  },
  button: {
    display: "inline-block",
    borderRadius: "8px",
    padding: "10px 20px",
    fontSize: "14px",
    fontWeight: 600,
    color: "#ffffff",
    textDecoration: "none",
  },
  hr: {
    borderColor: "#e2e8f0",
    margin: "24px 0 16px",
  },
  footer: {
    margin: 0,
    fontSize: "12px",
    lineHeight: "18px",
    color: "#94a3b8",
  },
}
