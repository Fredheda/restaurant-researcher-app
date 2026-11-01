# restaurant-researcher-app

A web interface for the `restaurant-researcher` skill: research a venue by chatting, and compare the results side by side on a card board.

**Status:** The code is public. The deployed app is behind sign-in and not publicly accessible.

<!-- screenshot -->

## What it does

- **Research by chat.** Ask about a restaurant in the chat. The app shows progress steps (address and hours, ratings, journey) and adds the place to the board. The chat is a column on the right on wide screens and a bottom sheet on phones.
- **Card board.** Each place appears as a photo-led card with its Google rating, hygiene rating, price tier, opening status, a one-line reason it suits you, the route summary and a fit score out of 10. A card still being researched shows placeholder lines.
- **Detail view.** Open a card to see the full picture: review quotes (positive and negative), the whole menu with dishes that match your taste marked, the reasoning behind the fit score and any misses, and a schematic tube-map style route from Canary Wharf. From there you can open the rating sheet to score a visit (dishes, cocktails, vibe, staff, service); saving is a demo for now.
- **Compare.** Select two to four cards and compare taste fit, price, rating and journey time in one table.

The current phase is frontend only. Chat replies and place data come from built-in demo fixtures, so the UI can be built and tested before the research agent is connected.

## How it works

```mermaid
flowchart LR
    U[Browser] -->|Entra sign-in| EA[Easy Auth]
    EA --> A[Next.js app<br/>Azure Container Apps]
    A --> B[Card board and<br/>detail / compare views]
    A --> C[Chat panel]
    C --> S[Stub responder]
    S --> F[(Demo place fixtures)]
```

The app is a single Next.js page. The chat sends a query to a stub responder, which plays a short sequence of progress messages and then looks the place up by name (accent-insensitive) in a set of fixtures. A matching place is added to the board. Selecting cards enables the compare view. A typed `PlaceResult` model (overview, menu, taste fit, journey, optional existing rating) is the contract the real research agent will fill later.

The app runs on Azure Container Apps behind Microsoft Entra Easy Auth: only approved users can reach it, and it scales to zero when idle.

## Tech stack

- **Next.js 16 and React 19:** the app and its UI components.
- **Tailwind CSS 4:** styling.
- **TypeScript:** typed place model shared by the board, cards and views.
- **Vitest and Testing Library:** component and logic tests.
- **Docker and Azure Container Apps:** hosting, with a shared container registry and managed-identity image pulls.
- **Bicep:** infrastructure as code.
- **Microsoft Entra Easy Auth:** sign-in and per-user approval.
- **GitHub Actions:** tests, lint, type-check and build on every pull request.

## Repository layout

- `frontend/`: the Next.js app and its tests.
- `infra/`: Bicep template and deploy script.
- `scripts/`: build, deploy and access-management scripts.

## More

- [Run it locally](docs/development.md)
- [Deployment](deployment/)
