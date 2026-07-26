import { Cosmos } from "./scene/Cosmos";
import { Hud } from "./ui/Hud";
import { PlanetLog } from "./ui/PlanetLog";
import { Panels } from "./ui/Panels";
import { Instruments } from "./ui/Instruments";
import { MarkInput } from "./ui/MarkInput";
import { ContractAddress } from "./ui/ContractAddress";
import { FollowToggle } from "./ui/FollowToggle";
import { Ticker } from "./ui/Ticker";

export function App() {
  return (
    <>
      <Cosmos />
      <Hud />
      <Instruments />
      <Ticker />
      <Panels />
      <PlanetLog />
      <MarkInput />
      <ContractAddress />
      <FollowToggle />
    </>
  );
}
