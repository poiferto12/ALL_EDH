from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pyedhrec import EDHRec

app = FastAPI()
edhrec = EDHRec()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] # Permite peticiones locales
)

@app.get("/api/commander/{name}")
def get_commander_data(name: str):
    try:
        # pyedhrec puede obtener distintos tipos de cartas
        # Convertimos las listas devueltas a un formato JSON compatible
        synergy_cards = edhrec.get_high_synergy_cards(name)
        top_cards = edhrec.get_top_cards(name)
        
        # Armamos una lista artificial con scores básicos para que el frontend no rompa
        # pyedhrec no expone directamente los números exactos en todos los métodos, 
        # pero mapearemos las cartas de alta sinergia a un valor positivo
        
        cardlist = []
        
        # Asignamos valores dinámicos dependiendo de la posición en la lista (los primeros son los mejores)
        if synergy_cards:
            total_synergy = len(synergy_cards)
            for i, card_name in enumerate(synergy_cards):
                # La primera carta tiene un valor cercano a 1.0, la última cercano a 0.1
                synergy_score = 1.0 - (i / total_synergy) * 0.9
                cardlist.append({
                    "name": card_name,
                    "synergy": synergy_score, 
                    "num_decks": (total_synergy - i) * 100 
                })
                
        if top_cards:
            total_top = len(top_cards)
            for i, card_name in enumerate(top_cards):
                # Si ya existe, actualizamos su popularidad
                existing_card = next((c for c in cardlist if c["name"] == card_name), None)
                pop_score = (total_top - i) * 200 
                
                if existing_card:
                    existing_card["num_decks"] = max(existing_card["num_decks"], pop_score)
                else:
                    cardlist.append({
                        "name": card_name,
                        "synergy": 0.2, # Sinergia base por estar en top cards
                        "num_decks": pop_score
                    })

        return {"cardlist": cardlist}

    except Exception as e:
        return {"error": str(e), "cardlist": []}
