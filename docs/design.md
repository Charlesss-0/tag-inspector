# Design system

Tag Inspector is an inspection workspace designed for a 320–600 px side panel. The visual direction is a compact, quiet instrument panel: neutral white/charcoal surfaces and ink, one forest-green accent, small square identifiers, ruled rows, and monospace technical values. Dark mode changes surfaces and contrast without changing hierarchy. No remote fonts or assets are loaded.

Typography uses locally available Avenir Next / Segoe UI, with system monospace for timestamps and IDs. Body text is 12 px, section titles 15 px, site title 20 px. Spacing follows a 4 px rhythm. Borders separate information; cards are reserved for neither navigation nor every individual datum. Focus rings and explicit labels support keyboard interaction.

The seven requested sections use a wrapping two-row navigation at narrow widths. A common detail viewer exposes progressively disclosed evidence. Stream lists render 60 results at a time with explicit expansion. Search state is kept per section. Counts always describe retained observations, not conversion success.

Surface, navigation, hover, border, secondary text and accent tokens are distinct in both themes. Green is reserved for the brand, selection and capture status. The root and flex column shell span at least 100dvh; main grows and the footer participates in normal flow. The document is the only vertical scrolling region, with no fixed footer overlap or compensating bottom padding.
