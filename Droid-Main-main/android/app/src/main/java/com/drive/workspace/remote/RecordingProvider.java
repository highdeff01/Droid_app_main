package com.drive.workspace.remote;

import android.content.*;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.*;

/** Read-only, explicit URI grants let the user share app-private MP4s. */
public class RecordingProvider extends ContentProvider {
    public boolean onCreate() { return true; }
    private File file(Uri uri) {
        if (uri.getPathSegments().size() != 1) throw new IllegalArgumentException("Invalid recording URI");
        return RecordingStore.video(getContext(), uri.getLastPathSegment());
    }
    public String getType(Uri uri) { file(uri); return "video/mp4"; }
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (!mode.equals("r")) throw new FileNotFoundException("Recordings are read-only");
        return ParcelFileDescriptor.open(file(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }
    public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sort) {
        File file = file(uri);
        String[] columns = projection == null ? new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE} : projection;
        MatrixCursor cursor = new MatrixCursor(columns); Object[] row = new Object[columns.length];
        for (int i = 0; i < columns.length; i++) {
            if (columns[i].equals(OpenableColumns.DISPLAY_NAME)) row[i] = "sightline-" + file.getName();
            if (columns[i].equals(OpenableColumns.SIZE)) row[i] = file.length();
        }
        cursor.addRow(row); return cursor;
    }
    public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException(); }
    public int update(Uri uri, ContentValues values, String selection, String[] args) { throw new UnsupportedOperationException(); }
    public int delete(Uri uri, String selection, String[] args) { throw new UnsupportedOperationException(); }
}
