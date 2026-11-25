"""Provider catalogue of the AI capability (SPEC-2204).

The six providers of `docs/architecture/data-model.md` section 9, their hosting region, the warning
shown by BR-IA-04 and the label of the credential card. The messages are French user-facing texts
and live in `learny.shared.locale_fr.ai`; this module only holds the structure (ADR-2011). The
per-provider capability flags belong to the live adapters, which this specification does not ship:
only the region projection used by BYOK is ported here.
"""

from dataclasses import dataclass
from typing import Literal

from learny.shared.locale_fr import ai as texts

AiProvider = Literal[
    "anthropic",
    "openai",
    "mistral",
    "deepseek",
    "opencode",
    "opencode_go",
    "openai_compatible",
    "local",
]

AI_PROVIDERS: tuple[AiProvider, ...] = (
    "anthropic",
    "openai",
    "mistral",
    "deepseek",
    "opencode",
    "opencode_go",
    "openai_compatible",
    "local",
)


@dataclass(frozen=True, slots=True)
class ProviderRegion:
    """What the settings screen and the credential DTO read from the catalogue (CA-5)."""

    outside_eu: bool
    data_note: str
    provider_label: str
    default_label: str
    requires_base_url: bool = False
    key_optional: bool = False


PROVIDER_REGIONS: dict[AiProvider, ProviderRegion] = {
    "anthropic": ProviderRegion(
        outside_eu=True,
        data_note=texts.OUTSIDE_EU_NOTE,
        provider_label=texts.ANTHROPIC_LABEL,
        default_label=texts.ANTHROPIC_LABEL,
    ),
    "openai": ProviderRegion(
        outside_eu=True,
        data_note=texts.OUTSIDE_EU_NOTE,
        provider_label=texts.OPENAI_LABEL,
        default_label=texts.OPENAI_LABEL,
    ),
    "mistral": ProviderRegion(
        outside_eu=False,
        data_note=texts.MISTRAL_NOTE,
        provider_label=texts.MISTRAL_LABEL,
        default_label=texts.MISTRAL_LABEL,
    ),
    "deepseek": ProviderRegion(
        outside_eu=True,
        data_note=texts.OUTSIDE_EU_NOTE,
        provider_label=texts.DEEPSEEK_LABEL,
        default_label=texts.DEEPSEEK_LABEL,
    ),
    "opencode": ProviderRegion(
        outside_eu=True,
        data_note=texts.OUTSIDE_EU_NOTE,
        provider_label=texts.OPENCODE_LABEL,
        default_label=texts.OPENCODE_LABEL,
    ),
    "opencode_go": ProviderRegion(
        outside_eu=True,
        data_note=texts.OUTSIDE_EU_NOTE,
        provider_label=texts.OPENCODE_GO_LABEL,
        default_label=texts.OPENCODE_GO_LABEL,
    ),
    "openai_compatible": ProviderRegion(
        outside_eu=False,
        data_note=texts.COMPATIBLE_NOTE,
        provider_label=texts.COMPATIBLE_LABEL,
        default_label=texts.COMPATIBLE_LABEL,
        requires_base_url=True,
    ),
    "local": ProviderRegion(
        outside_eu=False,
        data_note=texts.LOCAL_NOTE,
        provider_label=texts.LOCAL_LABEL,
        default_label=texts.LOCAL_LABEL,
        requires_base_url=True,
        key_optional=True,
    ),
}


def provider_region(provider: str) -> ProviderRegion:
    """`providerRegion`: the region, the warning and the labels of one provider."""
    return PROVIDER_REGIONS[_as_provider(provider)]


def _as_provider(provider: str) -> AiProvider:
    if provider not in PROVIDER_REGIONS:
        raise KeyError(f"unknown AI provider: {provider}")
    return provider  # narrowed by the membership test above


__all__ = [
    "AI_PROVIDERS",
    "PROVIDER_REGIONS",
    "AiProvider",
    "ProviderRegion",
    "provider_region",
]
