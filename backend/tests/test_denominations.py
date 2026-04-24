from sqlmodel import Session
from app.denominations.model import Denomination


def test_list_denominations_empty(client):
    response = client.get("/denominations")
    assert response.status_code == 200
    assert response.json() == []


def test_list_denominations_returns_all(client, session: Session):
    session.add(Denomination(name="Prosecco", type="DOC", regions=["Veneto", "Friuli Venezia Giulia"]))
    session.add(Denomination(name="Barolo", type="DOCG", regions=["Piemonte"]))
    session.commit()

    response = client.get("/denominations")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2


def test_denomination_shape(client, session: Session):
    session.add(Denomination(name="Barolo", type="DOCG", regions=["Piemonte"]))
    session.commit()

    response = client.get("/denominations")
    item = response.json()[0]
    assert set(item.keys()) == {"id", "name", "type", "regions"}
    assert item["name"] == "Barolo"
    assert item["type"] == "DOCG"
    assert item["regions"] == ["Piemonte"]
    assert isinstance(item["id"], int)
