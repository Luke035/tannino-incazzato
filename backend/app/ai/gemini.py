import os
from google import genai

MODEL_NAME = "gemini-3.1-flash-lite"


def _get_client() -> genai.Client:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not set")
    return genai.Client(api_key=api_key)


async def generate_hint(
    denomination_name: str,
    denomination_type: str,
    wrong_region: str,
    correct_regions: list[str],
    remaining_regions: list[str],
    attempt_number: int,
    language: str,
) -> str:
    client = _get_client()
    is_multi = len(correct_regions) > 1
    multi_note = (
        f"This denomination spans {len(correct_regions)} regions in total. "
        f"The student has already found {len(correct_regions) - len(remaining_regions)} of them "
        f"and still needs to find {len(remaining_regions)} more."
        if is_multi
        else ""
    )
    lang = "Italian" if language == "it" else "English"
    prompt = (
        f'You are an encouraging sommelier tutor. A student is learning Italian wine denominations.\n'
        f'The student placed "{denomination_name} {denomination_type}" in {wrong_region} '
        f"(wrong attempt {attempt_number}).\n"
        f"{multi_note}\n"
        f"The correct region(s) are: {', '.join(correct_regions)}. "
        f"The remaining unfound region(s) are: {', '.join(remaining_regions)}.\n"
        f"Give a short hint (1-2 sentences) in {lang} that helps them figure out the right region(s) "
        f"WITHOUT directly naming any region.\n"
        f"Use geographic, cultural, or historical clues. Be encouraging."
    )
    response = await client.aio.models.generate_content(model=MODEL_NAME, contents=prompt)
    return response.text


async def generate_memorize_tip(
    denomination_name: str,
    denomination_type: str,
    correct_regions: list[str],
    language: str,
) -> str:
    client = _get_client()
    region_str = ", ".join(correct_regions)
    lang = "Italian" if language == "it" else "English"
    prompt = (
        f"You are a sommelier tutor helping a student memorize Italian wine denominations.\n"
        f'The student failed to place "{denomination_name} {denomination_type}" — '
        f"the correct region(s) are: {region_str}.\n"
        f"Write a short, memorable tip (2-3 sentences) in {lang} that helps them remember this association.\n"
        f"Use a vivid geographic, historical, cultural, or sensory clue — something that sticks. "
        f"Be warm and encouraging."
    )
    response = await client.aio.models.generate_content(model=MODEL_NAME, contents=prompt)
    return response.text


async def generate_review(
    history: list[dict],
    language: str,
) -> str:
    client = _get_client()
    lines = []
    for h in history:
        region_str = ", ".join(h["correctRegions"])
        if h["result"] == "auto-placed":
            lines.append(f"{h['name']} {h['type']} ({region_str}): not guessed (auto-placed)")
        else:
            lines.append(
                f"{h['name']} {h['type']} ({region_str}): found with {h['wrongAttempts']} wrong attempt(s)"
            )
    summary = "\n".join(lines)
    lang = "Italian" if language == "it" else "English"
    prompt = (
        f"You are a sommelier tutor reviewing a student's practice session on Italian wine denominations.\n"
        f"Here are the results:\n{summary}\n\n"
        f"Write a personalized review in {lang} (3-5 sentences) that:\n"
        f"- Identifies patterns in errors (e.g. confused northern regions, weak on Sicilian denominations)\n"
        f"- Highlights what went well\n"
        f"- Gives 1-2 concrete study suggestions"
    )
    response = await client.aio.models.generate_content(model=MODEL_NAME, contents=prompt)
    return response.text
