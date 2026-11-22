Inter and Space Grotesk are distributed under the SIL Open Font License 1.1
(https://openfontlicense.org). The files in this directory are the static instances published by
Google Fonts, copied from the `@expo-google-fonts/inter` and `@expo-google-fonts/space-grotesk`
packages:

- Inter-Regular.ttf <- Inter_400Regular.ttf
- Inter-Medium.ttf <- Inter_500Medium.ttf
- Inter-SemiBold.ttf <- Inter_600SemiBold.ttf
- SpaceGrotesk-Bold.ttf <- SpaceGrotesk_700Bold.ttf
- SpaceGrotesk-Medium.ttf <- SpaceGrotesk_500Medium.ttf
- Inter-Bold.ttf <- Inter_700Bold.ttf
- SpaceGrotesk-SemiBold.ttf <- SpaceGrotesk_600SemiBold.ttf

The six weights of SPEC-3002 § 3 (Inter 400/500/600/700, Space Grotesk 500/600/700) are
therefore all embedded; a family carries its weight, so a style never sets `fontWeight`.

They are embedded by the `expo-font` plugin declared in `app.config.ts` (ADR-3004 § 4).
