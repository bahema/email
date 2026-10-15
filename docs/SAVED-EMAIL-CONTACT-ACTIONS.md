# Saved emails and unconfirmed contacts

Leads now has Confirmed and Unconfirmed filters, row actions, and selection of up to 25 unconfirmed contacts per page. Resend queues only eligible original signup confirmations and respects the existing cooldown. Delete permanently removes never-confirmed pending contacts, their signup records, links and confirmation jobs. Confirmed history, downloads, marketing jobs, sequences and in-flight transactional sends block deletion. No real contacts were deleted or resent during validation.

Newsletters and Campaigns each have a Saved email overlay with separate workspace libraries, search, pagination, preview, edit, select and delete. Send history includes status, dates and SMTP-accepted counts, and previews frozen content. Edit as new email creates a new draft from the original send snapshot. Delete history entry archives the visible entry; delivery, token and idempotency records remain. Active sends must be cancelled and finish processing before deletion. Connected lead-page and sequence emails remain protected.

Migration 16 adds workspace classification and archive fields. Existing emails used by audience campaigns are classified as campaign emails; other existing emails remain newsletters. Lead-page selection can still access the reusable library across workspaces. There is no new duplicate sending pipeline.

Validation: 131 backend tests passed and workspace type checks passed. Client, server-rendered frontend and backend production builds passed. Browser UI automation was unavailable in this session.
