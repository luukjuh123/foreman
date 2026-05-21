"""AI-powered review reply drafter.

Uses OpenAI when `settings.openai_api_key` is set; falls back to a
template-based Dutch reply when the key is absent.
"""

from __future__ import annotations

from app.core.config import settings


def _first_name(author_name: str) -> str:
    """Extract the first word of the author name."""
    return author_name.strip().split()[0] if author_name.strip() else author_name


def _template_reply(author_name: str, rating: int, comment: str | None) -> str:
    """Return a polite Dutch template reply based on the star rating."""
    name = _first_name(author_name)
    if rating >= 4:
        return (
            f"Beste {name},\n\n"
            "Hartelijk dank voor uw vriendelijke recensie! "
            "Het is fijn om te horen dat u tevreden bent over ons werk. "
            "Wij doen ons best om onze klanten altijd van de beste service te voorzien. "
            "We hopen u in de toekomst opnieuw van dienst te mogen zijn.\n\n"
            "Met vriendelijke groet,\nHet Foreman-team"
        )
    if rating == 3:
        return (
            f"Beste {name},\n\n"
            "Bedankt voor uw recensie en uw eerlijke feedback. "
            "We zijn blij dat u de moeite heeft genomen om uw ervaring te delen. "
            "We horen graag wat we kunnen verbeteren — aarzel niet om contact met ons op te nemen. "
            "Uw tevredenheid staat bij ons voorop.\n\n"
            "Met vriendelijke groet,\nHet Foreman-team"
        )
    # rating <= 2
    return (
        f"Beste {name},\n\n"
        "Hartelijk dank voor uw feedback. "
        "Het spijt ons te horen dat uw ervaring niet aan uw verwachtingen heeft voldaan. "
        "Wij nemen uw opmerkingen serieus en willen dit graag rechtzetten. "
        "Neemt u gerust contact met ons op zodat we dit samen kunnen oplossen.\n\n"
        "Met vriendelijke groet,\nHet Foreman-team"
    )


async def draft_reply(author_name: str, rating: int, comment: str | None) -> str:
    """Generate a professional Dutch reply draft.

    Falls back to a template when OPENAI_API_KEY is not set.
    """
    if not settings.openai_api_key:
        return _template_reply(author_name, rating, comment)

    try:
        import openai  # type: ignore[import-untyped]

        client = openai.AsyncOpenAI(api_key=settings.openai_api_key)
        comment_text = comment or "(geen tekstuele recensie)"
        user_msg = (
            f"Auteur: {author_name}\n"
            f"Beoordeling: {rating}/5 sterren\n"
            f"Recensie: {comment_text}\n\n"
            "Schrijf een professioneel antwoord op deze Google-recensie."
        )
        response = await client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a professional Dutch construction company responding to a Google review. "
                        "Be polite, professional, and personal. Reply in Dutch. Keep it under 200 words."
                    ),
                },
                {"role": "user", "content": user_msg},
            ],
            max_tokens=300,
        )
        return response.choices[0].message.content or _template_reply(author_name, rating, comment)
    except Exception:
        return _template_reply(author_name, rating, comment)
