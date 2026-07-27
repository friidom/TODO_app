import LiquidLoading from "../../ui/LiquidLoading";

export default function Loading() {
  return (
    <>
      <div className="flex min-h-screen  w-full items-center justify-center rounded-lg border bg-background p-4">
        <LiquidLoading />
        {/* {" "} */}
      </div>
    </>
  );
}
//
//background:
// 1)bg-violet-600
// 2)bg-red-200
// 3)white
