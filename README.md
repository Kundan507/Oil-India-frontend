# Oil India Tracker -- Frontend (v6)

New in this version:
1. Site creation form now has 4 coordinate fields: Start Latitude,
   Start Longitude, End Latitude, End Longitude -- instead of one pair.
   If you only have one location, enter the same coordinates in both.
2. The map now shows a green pin for each site's start point, an
   orange pin for its end point, and a dashed line connecting them
   (e.g. for a pipeline running between two places).
3. Fixed: a bad/invalid coordinate now shows a clear error message
   when creating a site, instead of the pin just silently not
   appearing with no explanation.
4. Admin's User Management page has a "Delete" button next to each
   manager/engineer (next to "Assign site"). Confirms before deleting;
   any tasks that person had are unassigned, not deleted, so the work
   history is preserved.
5. Project & Schedule now shows a small photo thumbnail next to every
   task that has one, whether the task is pending, approved, or
   rejected. Click the thumbnail to view it full size.

## Setup

Same as before -- replace App.jsx and api.js with these versions.
No new npm packages needed.

Make sure your backend is the v5 version (this depends on the new
startLatitude/startLongitude/endLatitude/endLongitude fields and the
DELETE /users/:id endpoint).

## Testing the new features

**Start/end point map:**
1. Log in as admin, go to Project & Schedule, click "+ New Site"
2. Fill in Start latitude/longitude and different End
   latitude/longitude (try: start 27.3667, 95.3333 and end 27.4200,
   95.4100 -- both in Assam, a short distance apart)
3. Create it, go to All Sites Overview, switch to Map view
4. You'll see a green pin (start) and an orange pin (end) connected by
   a dashed line

**Coordinate error handling:**
1. Try creating a site with a start latitude of "abc" instead of a
   number -- you'll get a clear error instead of a silently missing pin

**Delete a user:**
1. Log in as admin, go to User Management
2. Click "Delete" next to any manager or engineer, confirm
3. That account is gone -- check they can no longer log in

**Photos in Project & Schedule:**
1. Log in as an engineer, submit a progress update with a photo
2. Log in as admin, go to Project & Schedule
3. That task now shows a small photo thumbnail in the Photo column --
   click it to view full size
4. Approve the task (via Approval Center) and check back -- the photo
   is still showing in Project & Schedule

## Everything else

Unchanged from v5 -- login screen with your background image, sidebar,
dashboards, reports, and the government logos footer all still work
exactly as before.
