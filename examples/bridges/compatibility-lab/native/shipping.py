from datetime import date, datetime, time, timedelta


def create_worker(context):
    holidays = {date.fromisoformat(day) for day in context.config["holidays"]}
    cutoff = time.fromisoformat(context.config["cutoffLocal"])
    transit = context.config["businessDays"]

    def business_day(day):
        return day.weekday() < 5 and day not in holidays

    def next_business_day(day):
        day += timedelta(days=1)
        while not business_day(day):
            day += timedelta(days=1)
        return day

    def estimate(args, call):
        try:
            ordered = datetime.fromisoformat(args["orderedAtLocal"])
        except ValueError:
            return {"isError": True, "content": [{"type": "text", "text": "INVALID_LOCAL_TIMESTAMP"}]}
        parcels = args["parcels"]
        if any(p["kg"] > 30 for p in parcels):
            return {"isError": True, "content": [{"type": "text", "text": "PARCEL_OVER_LIMIT"}]}
        dispatch = ordered.date()
        if not business_day(dispatch) or ordered.time() >= cutoff:
            dispatch = next_business_day(dispatch)
        delivery = dispatch
        for _ in range(transit[args["service"]]):
            delivery = next_business_day(delivery)
        payload = {"dispatchDate": dispatch.isoformat(), "deliveryDate": delivery.isoformat(),
                   "parcelCount": len(parcels), "service": args["service"]}
        return {"content": [{"type": "text", "text": f"Delivery on {delivery}"}],
                "structuredContent": payload}

    return {"tools": {"estimate": estimate}}
