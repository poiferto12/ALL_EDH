from functools import lru_cache

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pyedhrec import EDHRec


app = FastAPI(
    title="ALL_EDH optional EDHREC server",
    version="0.1.0"
)

edhrec = EDHRec()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def clean_card_name(item):
    if isinstance(item, str):
        return item.strip()

    if isinstance(item, dict):
        for key in ("name", "sanitized"):
            value = item.get(key)

            if isinstance(value, str):
                return value.strip()

        card = item.get("card")

        if isinstance(card, str):
            return card.strip()

        if isinstance(card, dict):
            name = card.get("name")

            if isinstance(name, str):
                return name.strip()

    name = getattr(item, "name", None)

    if isinstance(name, str):
        return name.strip()

    return ""


def unique_names(items):
    result = []
    seen = set()

    for item in items or []:
        name = clean_card_name(item)

        if not name:
            continue

        key = name.lower()

        if key in seen:
            continue

        seen.add(key)
        result.append(name)

    return result


def build_cardlist(high_synergy_cards, top_cards):
    cardlist = {}

    total_synergy = max(
        len(high_synergy_cards),
        1
    )

    total_top = max(
        len(top_cards),
        1
    )

    for index, name in enumerate(high_synergy_cards):
        synergy_score = 1.0 - (
            index / total_synergy
        ) * 0.9

        cardlist[name.lower()] = {
            "name": name,
            "synergy": synergy_score,
            "num_decks": (
                total_synergy - index
            ) * 100,
            "source": "high_synergy"
        }

    for index, name in enumerate(top_cards):
        popularity_score = (
            total_top - index
        ) * 200

        key = name.lower()

        if key in cardlist:
            cardlist[key]["num_decks"] = max(
                cardlist[key]["num_decks"],
                popularity_score
            )

            cardlist[key]["source"] = "both"
        else:
            cardlist[key] = {
                "name": name,
                "synergy": 0.2,
                "num_decks": popularity_score,
                "source": "top_cards"
            }

    return list(cardlist.values())


@lru_cache(maxsize=128)
def get_cached_commander_data(name):
    high_synergy_cards = unique_names(
        edhrec.get_high_synergy_cards(name)
    )

    top_cards = unique_names(
        edhrec.get_top_cards(name)
    )

    cardlist = build_cardlist(
        high_synergy_cards,
        top_cards
    )

    average_deck = [
        {
            "name": card_name,
            "rank": index + 1
        }
        for index, card_name in enumerate(
            top_cards[:99]
        )
    ]

    return {
        "commander": name,
        "cardlist": cardlist,
        "averageDeck": average_deck,
        "topCards": [
            {
                "name": card_name,
                "rank": index + 1
            }
            for index, card_name in enumerate(top_cards)
        ],
        "highSynergyCards": [
            {
                "name": card_name,
                "rank": index + 1
            }
            for index, card_name in enumerate(
                high_synergy_cards
            )
        ],
        "hasEnoughData": len(average_deck) >= 20
    }


@app.get("/api/commander/{name}")
def get_commander_data(name: str):
    try:
        return get_cached_commander_data(name)
    except Exception as error:
        return {
            "commander": name,
            "cardlist": [],
            "averageDeck": [],
            "topCards": [],
            "highSynergyCards": [],
            "hasEnoughData": False,
            "error": str(error)
        }